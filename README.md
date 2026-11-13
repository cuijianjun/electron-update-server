# Electron 本机更新服务

为同级的 `electron-vue-skeleton-win`、`electron-vue-skeleton-uos` 提供统一、只读的更新下载服务。Node24.22.0/npm11.19.1；Express4.22.2、js-yaml4.3.2和semver7.8.6锁定。沿用客户端的electron-updater6.8.11及签名renderer协议，不引入数据库或另一套更新SDK。

## 本机启动

```sh
npm ci
npm run init:local
npm run service:install
curl http://127.0.0.1:25565/healthz
```

初始化会定位同级两个客户端，生成各自独立的Ed25519密钥，写入其 `config/updates.json` 的本机地址模板和公钥。客户端重新 `npm run build:app` / 打包后生效；不复制私钥到客户端。已有私钥复用；已有客户端公钥却缺少私钥时拒绝悄悄换钥，必须先恢复备份。只有全新部署才使用 `npm run init:local -- --new-deployment`，随后重建客户端；它不会让旧安装器自动信任新密钥。

本次部署使用本机回环地址，适用于服务与客户端同机。另一台Windows/UOS机器无法通过自己的127.0.0.1访问本机；迁到网络服务器时配置可信HTTPS地址并保持发布密钥。macOS上的服务运行和交叉包检查不能代替UOS真机验收。

`service:install` 安装用户级macOS LaunchAgent，保持运行并随登录启动；固定使用安装命令所用的Node可执行路径。前台运行用 `npm start -- --config /path/config.json`，不要与常驻服务抢占同一个端口。其他系统使用前台进程或自己的服务管理器。

## 配置、密钥与数据

| 路径（相对用户目录） | 内容与保留方式 |
|---|---|
| `.config/electron-update-server/config.json` | 端口、数据目录、项目/平台/架构/channel白名单与公钥 |
| `.config/electron-update-server/keys/` | 每项目的private.pem（600）和public.pem；目录700，长期备份，禁止提交Git |
| `.local/share/electron-update-server/` | 已发布的不可变包、当前版本指针、renderer基线与logs；长期保留 |
| `Library/LaunchAgents/com.cjjxw.electron-update-server.plist` | 本机用户级服务入口 |

服务器仅加载公钥，不读取签名私钥；私钥由客户端的 `pack:resources` 在本机签名时读取。Ed25519用于renderer清单，不替代Windows代码签名证书。更换配置后重启服务，客户端公钥变更须重启应用。

## 地址与发布

统一前缀：`/v1/<project>/<platform>/<arch>/latest/`。

| 项目 | 平台/架构 | 全量清单 |
|---|---|---|
| electron-vue-skeleton-win | win32/x64 | full/latest.yml |
| electron-vue-skeleton-uos | linux/x64 | full/latest-linux.yml |
| electron-vue-skeleton-uos | linux/arm64 | full/latest-linux-arm64.yml |

renderer清单是 `resources/<runtimeId>/manifest.json`，签名中的归档basename在同URL目录可取。客户端自动替换 `{arch}` 与 `{runtimeId}`；不同主进程/预加载/依赖运行时分别发布，防止旧客户端拿到不兼容的界面。

全量示例：先在Windows客户端更新应用版本并构建，再执行：

```sh
npm run publish:full -- --project electron-vue-skeleton-win --platform win32 --arch x64 --dir ../electron-vue-skeleton-win/release
```

UOS替换project/platform/arch及release路径。发布器读取对应架构builder元数据，验证SHA512/大小/格式，保留原artifact文件名，把path和files[].url改为 `versions/<version>/<filename>`。版本目录不可覆盖，旧、新blockmap可持续下载；校验完成后原子切换current。GET、HEAD、单段与保序多段Range均支持，兼容NSIS真实差分下载器；元数据no-store，版本化包长缓存。

增量示例（在客户端项目执行打包；base目录必须来自上一版真实renderer）：

```sh
npm run pack:resources -- --platform win32 --arch x64 --version 1.0.1 --signing-key ~/.config/electron-update-server/keys/electron-vue-skeleton-win-private.pem --base-dir /archive/1.0.0/renderer --base-version 1.0.0
```

默认密钥目录是 `~/.config/electron-update-server/keys`。然后回到服务端：

```sh
npm run publish:resources -- --project electron-vue-skeleton-win --platform win32 --arch x64 --dir ../electron-vue-skeleton-win/release/resources/win32-x64
```

发布器验证项目公钥、运行时/平台/架构、签名与全部归档SHA256。schema1完整renderer包、schema2差异包和完整snapshot均支持，要求现有packer生成的内容寻址文件名。不会改写已签名字段；旧归档继续服务，已检查的客户端在版本切换后仍可下载。每次构建保留完整renderer基线供下次生成差异；本机初始基线位于数据目录的 `baselines/<project>/<runtimeId>/1.0.0/renderer`。

同版本不同内容、较旧版本提升、并发发布、路径越界和目录链接均拒绝。若发布进程被外部强制终止导致锁遗留，确认没有发布者后人工检查 `.publish-lock`；服务不会擅自删除活跃锁。发布方式是本机CLI，HTTP没有写入或私钥接口。

初始发布为1.0.0，与当前客户端同版本时“无更新”是正常结果；后续发布必须增加对应应用/renderer版本。main/preload/Electron/依赖变更走全量；旧客户端先安装支持当前协议的完整应用。

## 测试与运行管理

```sh
npm test
npm run test:clients
```

普通测试独立运行；test:clients要求同级两客户端已安装依赖且有新鲜production构建，实际调用各自packer→发布→HTTP→各自ResourceUpdateController完成差异与snapshot回退。差分测试实际使用锁定的GenericDifferentialDownloader，验证跨多批500段请求、20KB请求头、旧新blockmap URL和最终SHA512，不允许退回整包；另覆盖中途断开请求、篡改、同版覆盖、并发与链接边界。

macOS服务管理：

```sh
launchctl print gui/$(id -u)/com.cjjxw.electron-update-server
launchctl kickstart -k gui/$(id -u)/com.cjjxw.electron-update-server
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.cjjxw.electron-update-server.plist
```

日志在数据目录logs。停止服务不删除包或密钥；重新 `service:install` 可恢复。

可选Docker：提供Dockerfile/compose.yaml，`UPDATE_CONFIG_FILE`挂载单个公开配置文件，`UPDATE_DATA_DIR`挂载数据目录，`UPDATE_UID/UPDATE_GID`设为文件所属用户；容器不挂载keys目录。端口仍只映射主机127.0.0.1。容器内数据根覆盖为/data；本轮实际部署方式为原生LaunchAgent。

协议依据：[electron-builder v26更新文档](https://www.electron.build/v26/docs/features/auto-update/)，并核对锁定库的Provider、GenericDifferentialDownloader与multipart解析源码。
