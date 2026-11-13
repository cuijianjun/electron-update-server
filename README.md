# Electron 更新服务：本机测试与生产部署

为 [Windows 客户端](https://github.com/cuijianjun/electron-vue-skeleton-win/blob/agent/vue3-upgrade-main/README.md)和 [UOS 客户端](https://github.com/cuijianjun/electron-vue-skeleton-uos/blob/agent/vue3-upgrade-main/README.md)提供全量安装包、NSIS 差分下载和签名 renderer 增量更新。HTTP 只读，发布通过本地 CLI 完成，不提供上传或私钥接口。

固定 Node24.22.0 / npm11.19.1，Express4.22.2、js-yaml4.3.2、semver7.8.6；协议兼容客户端锁定的 electron-updater6.8.11。当前实际部署为 macOS 本机 LaunchAgent，`http://127.0.0.1:25565/healthz`，已发布三目标1.0.0基线。本文生产示例为 Linux + Docker Compose + 宿主 Nginx；公网部署待实际服务器地址、访问权限和可信 TLS 证书就绪后执行。

## 1. 仓库与更新地址

三个目录同级放置，客户端测试和 `init:local` 默认按这个布局定位：

```text
yz/
  electron-vue-skeleton-win/
  electron-vue-skeleton-uos/
  electron-update-server/
```

客户端工作分支为 `agent/vue3-upgrade-main`；服务端为 `agent/update-server-main`，服务端默认 main 也保留已交付代码。构建安装器与提交 GitHub 是独立步骤；GitHub push 不会上传安装包或切换更新版本。

| 项目 | platform / arch | 前缀后的全量清单 |
|---|---|---|
| electron-vue-skeleton-win | win32 / x64 | full/latest.yml |
| electron-vue-skeleton-uos | linux / x64 | full/latest-linux.yml |
| electron-vue-skeleton-uos | linux / arm64 | full/latest-linux-arm64.yml |

统一前缀：`<ORIGIN>/v1/<project>/<platform>/<arch>/latest/`。资源清单：`resources/<runtimeId>/manifest.json`，ZIP 在同一个 runtimeId URL 目录。客户端配置保留 `{arch}`、`{runtimeId}`，主进程按实际目标展开。

| 改动 | 更新方式 |
|---|---|
| Electron、main、preload、依赖锁、安装包配置 | 增加应用版本，发布完整 EXE/DEB |
| 只改 renderer，runtimeId 不变 | 应用版本不变，增加资源版本，发布签名差异 ZIP 和完整快照 |

Windows 全量安装器可依据新旧 EXE.blockmap 使用 HTTP Range 差分下载；UOS 全量使用 DEB。renderer 差异更新是独立通道，不能升级 Electron/main/preload。

## 2. 本机初始化与常驻运行

已有本机部署可直接复用，不必重跑初始化。新发布机在专用 Bash/zsh 会话按以下顺序操作；命令块启用 `set -e`，失败即停止当前会话，处理后再继续：

```sh
set -e
cd /path/to/yz/electron-update-server
nvm install
nvm use
node --version
npm --version
npm ci
# 迁移已有应用时先恢复原keys；下面命令会写入同级两个client的公开配置。
npm run init:local
# 仅macOS；其他系统用npm start或下文Docker。
npm run service:install
curl --fail http://127.0.0.1:25565/healthz
```

初始化为两个项目生成独立 Ed25519 密钥，已有密钥复用；写入服务端配置和客户端 `config/updates.json`，随后客户端重新构建/打包才生效。可用 `--win-client /abs/path --uos-client /abs/path --port 25565` 指定客户端路径与端口；`init:local` 的输出目录固定为当前用户配置/数据目录，`--config` 不改变初始化位置。

已有客户端公钥但私钥缺失或不匹配时，初始化会拒绝：先恢复备份。`npm run init:local -- --new-deployment` 只适用于决定使用新信任根的全新客户端；不覆盖已有私钥，也不会让旧安装器自动信任新公钥。上线迁移不使用这个参数，不重复初始化覆盖正式地址。

前台诊断用 `npm start -- --config /absolute/path/config.json`，不要和常驻服务抢占端口。macOS 服务固定安装时的 Node 可执行文件绝对路径；移动 Node/仓库前先检查 LaunchAgent。

## 3. 配置、密钥与数据保留

| 路径（相对当前用户目录） | 内容与备份 |
|---|---|
| `.config/electron-update-server/config.json` | host、port、dataDir、项目白名单、公钥；可复制至服务器 |
| `.config/electron-update-server/keys/` | 每项目 private.pem（600）/public.pem；目录700，离线备份，不提交Git |
| `.local/share/electron-update-server/` | 不可变发布包、指针、archives、renderer基线、logs；长期保留 |
| `Library/LaunchAgents/com.cjjxw.electron-update-server.plist` | 本机用户级服务入口 |

本机配置结构如下，`publicKey` 必须填初始化生成的 PEM，不能使用占位文字启动：

```json
{
  "host": "127.0.0.1",
  "port": 25565,
  "dataDir": "/absolute/path/to/electron-update-data",
  "projects": {
    "electron-vue-skeleton-win": {
      "platform": "win32", "arches": ["x64"], "channels": ["latest"],
      "publicKey": "<原Windows项目公钥PEM，保留换行>"
    },
    "electron-vue-skeleton-uos": {
      "platform": "linux", "arches": ["x64", "arm64"], "channels": ["latest"],
      "publicKey": "<原UOS项目公钥PEM，保留换行>"
    }
  }
}
```

启动与发布命令均可通过 `--config` 或 `UPDATE_SERVER_CONFIG` 指定配置，否则读取默认用户配置。只有 serve 支持 `HOST` / `UPDATE_DATA_DIR` 环境覆盖；发布 CLI 应使用实际宿主 dataDir 的配置。相对 dataDir 按配置文件所在目录解析。

服务端验证时仅用公钥，运行容器不挂载 keys。签名私钥保留在可信发布机，由客户端 `pack:resources` 读取；丢失后不能用新私钥给旧客户端发可信资源。Windows Authenticode 证书与 Ed25519 资源签名独立，目前不把资源签名视为安装器代码签名。

数据目录内部布局：

```text
<project>/<platform>/<arch>/latest/
  full/current.json
  full/versions/<appVersion>/{安装包,blockmap,latest*.yml,release.json}
  resources/<runtimeId>/current.json
  resources/<runtimeId>/versions/<resourceVersion>/{manifest.json,release.json}
  resources/<runtimeId>/archives/renderer[-delta]-<sha256>.zip
baselines/<project>/<platform>-<arch>/<runtimeId>/<resourceVersion>/{renderer/,manifest.json}
logs/
```

`baselines` 由发布者保存，发布 CLI 不会自动创建；新发布按平台/架构隔离，保留完整 renderer 和对应 manifest，供下一版生成差异。当前本机1.0.0旧基线仍在 `baselines/<project>/<runtimeId>/1.0.0/renderer`，不移动/覆盖；使用前核对目标与实际内容，再显式引用或复制到新布局。runtimeId本身不含架构，不能仅凭其相同就省略架构目录。不可用符号链接代替存储子目录。备份时暂停发布者，保证指针与包一起复制；只读下载服务可继续运行。保留仍被旧客户端引用的安装包、blockmap 和归档，不直接清空数据目录。

## 4. 全量与增量发布

以下命令在服务端仓库根目录执行，使用与客户端同一 Node24.22.0。实际构建、版本号、公钥/URL配置与基线保存命令在两客户端 README 中。首次全量发布后同时登记该应用版本的完整 renderer 基线；同版本客户端显示无更新正常。

### 全量安装包

```sh
set -e
CONFIG="$HOME/.config/electron-update-server/config.json"
# 默认release目录；若客户端用了--output，--dir改为实际隔离输出目录。
npm run publish:full -- --config "$CONFIG" --project electron-vue-skeleton-win --platform win32 --arch x64 --dir ../electron-vue-skeleton-win/release
npm run publish:full -- --config "$CONFIG" --project electron-vue-skeleton-uos --platform linux --arch x64 --dir ../electron-vue-skeleton-uos/release
npm run publish:full -- --config "$CONFIG" --project electron-vue-skeleton-uos --platform linux --arch arm64 --dir ../electron-vue-skeleton-uos/release
```

每个目录必须有对应 latest*.yml 及其引用的 EXE/DEB，Windows 还应有 EXE.blockmap。发布器验证 SHA512、大小、文件格式，保留 artifact 文件名，把 metadata 中 path / files[].url 重写为 `versions/<version>/<filename>`。全部验证完成后原子切换 current.json；无需重启下载服务。

旧、新版本完整路径都保留，Provider 能下载旧/新 blockmap。服务支持 GET、HEAD、单段及按请求顺序返回的多段 Range。metadata 返回 no-store；版本化安装包与 ZIP 长期缓存。

### renderer 签名增量

以 Windows 应用仍为1.0.1、资源1.0.1→1.0.2为例，在 Windows 客户端仓库中：

```sh
set -e
npm run build:app
npm run pack:resources -- --platform win32 --arch x64 --version 1.0.2 --signing-key "$HOME/.config/electron-update-server/keys/electron-vue-skeleton-win-private.pem" --base-dir /archive/actual-runtime-id/1.0.1/renderer --base-version 1.0.1 --out release/resources/win32-x64/1.0.2
```

`base-dir` 是该 runtimeId 上一版真正发布的完整 renderer，不是当前修改后的目录；本机已存初始基线在 dataDir/baselines。打包前保持应用版本、main/preload、依赖与锁文件不变，并比较前后 manifest.runtimeId；不一致改走全量更新。UOS 对应 platform=linux、arch=x64/arm64 和 UOS 项目私钥，分别打包。

回到服务端发布（UOS替换项目/平台/架构及目录）：

```sh
set -e
npm run publish:resources -- --config "$CONFIG" --project electron-vue-skeleton-win --platform win32 --arch x64 --dir ../electron-vue-skeleton-win/release/resources/win32-x64/1.0.2
```

schema2 输出差异 ZIP 和完整 snapshot；发布器用该项目公钥验证签名、runtimeId/平台/架构和两份归档 SHA256，不改写签名字段。客户端基线版本/哈希匹配时用差异，否则只用同一签名清单指定的完整快照。没有 base 参数的 schema1 为完整 renderer；旧协议客户端先全量升级。两个 ZIP 都先入库，最后切换 manifest 指针。发布成功后保存1.0.2完整 renderer 及 manifest 作为下一版基线。

两种通道的切换各自原子化，跨通道不是一个事务。每项目/平台/架构/通道，以及每个 renderer runtimeId 分别控制当前版本；旧 runtimeId 的清单可继续服务。

## 5. 正式服务器部署（取得地址后执行）

### 5.1 部署参数与主机准备

下面固定路径便于直接替换部署，均是未来服务器上的路径；不会改变本机测试配置。

| 参数 | 示例 / 要求 |
|---|---|
| SSH目标 | `deploy@server.example.com`，能创建目标目录、运行Docker及管理Nginx |
| 更新域名 | `updates.example.com`，DNS指向服务器，客户端使用最终可信HTTPS地址 |
| TLS证书 | 由现有证书工具申请可信证书并配置续期；以下示例使用 `/etc/letsencrypt/live/<域名>/` |
| 系统 | Linux，Docker Engine + Compose v2、宿主Nginx、Node24.22.0/npm11.19.1及nvm（运行发布CLI；下方用nvm选择版本） |
| 网络 | 开放HTTPS443及受控SSH；HTTP80用于重定向/证书验证，25565仅宿主回环 |
| 仓库访问 | 服务器能读取私有Git仓库；不把访问token写入README或镜像 |

以下在服务器以部署用户执行，`/srv` 与 `/etc` 创建需要 sudo。保留现有部署时先核对所有者及路径，不覆盖其他服务：

```sh
set -e
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /etc/electron-update-server /srv/electron-update-data /srv/electron-update-incoming
sudo install -d -m 755 -o "$(id -u)" -g "$(id -g)" /srv/electron-update-server
git clone --branch agent/update-server-main git@github.com:cuijianjun/electron-update-server.git /srv/electron-update-server
cd /srv/electron-update-server
nvm install
nvm use
npm ci
```

已有仓库用 `git pull --ff-only`，先保留本地修改。不要在生产服务器运行 `init:local` 重新生成公钥或覆盖客户端地址。

### 5.2 迁移公开配置与已发布数据

在当前本机发布机执行；迁移期间暂停所有发布者。只迁移公开配置和 data，不上传签名私钥：

```sh
set -e
DEPLOY_SSH=deploy@server.example.com
node - "$HOME/.config/electron-update-server/config.json" /tmp/electron-update-server-public-config.json <<'NODE'
const fs = require('node:fs')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
config.host = '127.0.0.1'
config.port = 25565
config.dataDir = '/srv/electron-update-data'
fs.writeFileSync(process.argv[3], JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
NODE
scp /tmp/electron-update-server-public-config.json "$DEPLOY_SSH:/etc/electron-update-server/config.json"
rsync -a "$HOME/.local/share/electron-update-server/" "$DEPLOY_SSH:/srv/electron-update-data/"
rm /tmp/electron-update-server-public-config.json
```

此处只删除自己生成的公开临时配置。私钥仍保留本机，并另做离线备份。若服务器 rsync 不可用，先安装或采用等价的完整数据备份恢复。基线可保留本地发布机，也可作为 data 中一部分迁移；签名仍在本机执行。

在服务器核对部署用户可读配置/data并拥有后续发布的写权限；迁移到新 UID 时只调整这两个专用路径的属主：

```sh
set -e
sudo chown -R "$(id -u):$(id -g)" /etc/electron-update-server /srv/electron-update-data
chmod 600 /etc/electron-update-server/config.json
node -e "require('./src/config.cjs').loadConfig('/etc/electron-update-server/config.json'); console.log('config OK')"
cat > /etc/electron-update-server/compose.env <<ENV
UPDATE_UID=$(id -u)
UPDATE_GID=$(id -g)
UPDATE_CONFIG_FILE=/etc/electron-update-server/config.json
UPDATE_DATA_DIR=/srv/electron-update-data
ENV
chmod 600 /etc/electron-update-server/compose.env
```

### 5.3 启动容器

在服务器 `/srv/electron-update-server` 执行：

```sh
set -e
docker compose --env-file /etc/electron-update-server/compose.env config --quiet
docker compose --env-file /etc/electron-update-server/compose.env up -d --build
docker compose --env-file /etc/electron-update-server/compose.env ps
curl --fail http://127.0.0.1:25565/healthz
```

compose只映射 `127.0.0.1:25565`，挂载单个公开配置和 data（只读），不挂载 keys。容器内 `HOST=0.0.0.0`、`UPDATE_DATA_DIR=/data` 覆盖宿主路径；配置中的 port 必须与映射一致。宿主发布CLI仍读 `/srv/electron-update-data` 并以部署用户写入，容器按同 UID/GID 实时读取。修改配置后重建/重启容器；发布新包无需重启。

### 5.4 配置宿主 Nginx 的 HTTPS 入口

证书准备好后，将下面内容保存到服务器 `/etc/nginx/conf.d/electron-updates.conf`（确保主 nginx.conf 的 http 段包含该目录），替换域名及证书路径。此处 Nginx 在宿主机；若改为容器Nginx，127.0.0.1的含义与网络配置须另行调整。

```nginx
server {
    listen 80;
    server_name updates.example.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name updates.example.com;
    ssl_certificate /etc/letsencrypt/live/updates.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/updates.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    # NSIS多段Range可能超过20KB，不能沿用8KB单字段限制。
    large_client_header_buffers 4 64k;
    location / {
        limit_except GET HEAD { deny all; }
        # 不带URI后缀，保留 /v1/... 完整路径。
        proxy_pass http://127.0.0.1:25565;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_set_header Accept-Encoding "";
        proxy_cache off;
        proxy_buffering off;
        proxy_read_timeout 300s;
        gzip off;
    }
}
```

```sh
set -e
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://updates.example.com/healthz
```

保留上游 `Content-Range`、`Content-Length`、`Content-Type: multipart/byteranges` 和 `Cache-Control`；不把所有响应统一缓存，不对ZIP/EXE改压缩或重写多段Range。若上层有CDN/网关，还需确认同样支持大Range头、保序多段206和metadata不缓存。[请求头缓冲依据](https://nginx.org/en/docs/http/ngx_http_core_module.html#large_client_header_buffers)、[代理配置依据](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)。

### 5.5 客户端切正式源与首次发布

两个客户端分别把 `config/updates.json` 的 `fullURL` / `resourceURL` 换成正式HTTPS origin，保留各自公钥及占位符；可直接使用各自README的Node命令。重新构建首次生产全量包，保存新runtimeId基线，再发布。服务端无需配置公网origin，返回的是相对归档路径。

仍指向本机127.0.0.1的已安装客户端不会自行发现公网源，需首次安装新包，或有权限时修改安装目录 `resources/updates.json` 后重启。资源更新不能替它更换主进程读到的公开配置。不要把本机测试服务关闭后期待旧地址仍能检查更新。

### 5.6 以后向服务器发布新版本

在本机客户端完成打包与签名，暂存目录按项目/架构/版本隔离。例如 Windows1.0.1：

```sh
set -e
# 在Windows客户端项目根目录；更改示例版本/输出路径以匹配本次构建。
DEPLOY_SSH=deploy@server.example.com
FULL_DIR=release/full/win32-x64/1.0.1
RESOURCE_DIR=release/resources/win32-x64/1.0.1
ssh "$DEPLOY_SSH" 'mkdir -p /srv/electron-update-incoming/win-x64-1.0.1/full /srv/electron-update-incoming/win-x64-1.0.1/resources'
scp "$FULL_DIR/"*.exe "$FULL_DIR/"*.exe.blockmap "$FULL_DIR/latest.yml" "$DEPLOY_SSH:/srv/electron-update-incoming/win-x64-1.0.1/full/"
scp "$RESOURCE_DIR/"*.zip "$RESOURCE_DIR/manifest.json" "$DEPLOY_SSH:/srv/electron-update-incoming/win-x64-1.0.1/resources/"
```

然后在服务器，以Node24.22.0和部署用户执行：

```sh
set -e
cd /srv/electron-update-server
nvm use
node src/cli.cjs publish-full --config /etc/electron-update-server/config.json --project electron-vue-skeleton-win --platform win32 --arch x64 --dir /srv/electron-update-incoming/win-x64-1.0.1/full
node src/cli.cjs publish-resources --config /etc/electron-update-server/config.json --project electron-vue-skeleton-win --platform win32 --arch x64 --dir /srv/electron-update-incoming/win-x64-1.0.1/resources
```

只发增量时仅上传本次资源目录中的两个ZIP及manifest，执行 publish-resources。UOS全量上传 `*.deb` 和对应 `latest-linux*.yml`，资源上传相应架构的ZIP和manifest；CLI改为UOS项目、linux与目标arch。不上传 unpacked 目录、node_modules或私钥。

所有上传完成后才执行发布器；失败时 current 保持原版本。正式与本机各有自己的数据根，本机publish不会同步服务器。验收成功且不可变存储/备份完整后，incoming目录可清理；保留发布基线与manifest。

## 6. 上线前验收

### 6.1 自动化验证

在同级三个仓库安装依赖，使用固定Node版本。两个客户端先各执行 `npm run test:unit`、`npm run build:app`。当前 `test:e2e` / `test:packaged` 含固定应用1.0.0与资源1.0.1等断言，只在应用仍为1.0.0时执行这组夹具；应用版本升级后的发布不直接运行它们，也不通过降版本迁就夹具。后续版本使用下方动态版本联调，并完成实际目标机新旧包验收。随后在服务端运行：

```sh
set -e
npm test
npm run test:clients
```

服务端测试使用隔离临时目录和本地HTTP，不往日常服务发布测试版本。test:clients要求两个client都有新鲜production构建，实际调用packer→发布→HTTP→各自ResourceUpdateController，覆盖差异合成、删除和基线不同的snapshot回退。NSIS差分测试使用真实锁定GenericDifferentialDownloader，多批500段请求、20KB头、旧新blockmap及最终SHA512，禁止整包fallback；另覆盖篡改、并发、链接、断流等边界。

`test:dev` 会临时修改/还原模板验证HMR，运行后重新 `build:app` 再打包。Windows原生安装验收用client的 `test:windows`（独立测试账号/VM及两版本安装器）；UOS须在目标系统验证DEB安装/提权、拒绝授权、升级、卸载与数据保留。

### 6.2 通过真实HTTPS入口检查下载

在任意能访问正式域名的机器执行，下例检查已发布Windows基线；UOS用对应prefix和metadata名重复：

```sh
set -e
ORIGIN=https://updates.example.com
FEED="$ORIGIN/v1/electron-vue-skeleton-win/win32/x64/latest/full/"
curl --fail "$ORIGIN/healthz"
curl --fail -i "${FEED}latest.yml"
# 从latest.yml中复制实际 files[0].url（versions/.../文件名），路径保留URL编码。
ARTIFACT_URL="${FEED}versions/1.0.1/myapp%20Setup%201.0.1.exe"
curl --fail -I "$ARTIFACT_URL"
curl --fail -D - -o /dev/null -H 'Range: bytes=0-15' "$ARTIFACT_URL"
curl --fail -D - -o /dev/null -H 'Range: bytes=100-115,0-15' "$ARTIFACT_URL"
# 从实际发布manifest读取runtimeId，替换下面占位值。
curl --fail -i "$ORIGIN/v1/electron-vue-skeleton-win/win32/x64/latest/resources/<runtimeId>/manifest.json"
```

metadata预期200/no-store，HEAD预期文件大小与Accept-Ranges，单/多段预期206；多段Content-Type必须multipart/byteranges，顺序与请求一致。不要用 `curl -k` 绕过正式TLS验证。按manifest中的相对文件名取差异ZIP及fallback ZIP，验证SHA256和签名；最终仍需从旧版客户端走完下载、安装/重启及版本确认，而非只看healthz。

上线检查：三个目标元数据和归档可取；HTTPS证书可信；旧版→新版全量更新及数据保留；renderer差异、跳版本快照、取消和重启；旧包/blockmap仍可下载；服务重启与服务器重启后可用。具体UOS版本、CPU、glibc和桌面会话未确认前，不把交叉打包视为真机认证。

## 7. 运行管理、恢复与清理

macOS本机服务：

```sh
set -e
launchctl print gui/$(id -u)/com.cjjxw.electron-update-server
launchctl kickstart -k gui/$(id -u)/com.cjjxw.electron-update-server
# 显式停止，保留数据；重新npm run service:install可恢复。
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.cjjxw.electron-update-server.plist
```

本机日志在dataDir/logs。Docker生产服务在服务端仓库运行：

```sh
set -e
docker compose --env-file /etc/electron-update-server/compose.env logs --tail=100 updates
docker compose --env-file /etc/electron-update-server/compose.env restart updates
# 修改源码/依赖后重建镜像；操作前保留上一镜像和部署commit，以便恢复服务代码。
docker compose --env-file /etc/electron-update-server/compose.env up -d --build
```

| 现象 | 处理 |
|---|---|
| 没有更新 | 检查源/环境覆盖、应用与资源版本、平台/架构/runtimeId；1.0.0基线与1.0.0客户端同版正常 |
| 404 | 检查prefix、对应架构的清单是否发布、data挂载及属主、Nginx是否保留完整路径 |
| 签名/运行时失败 | 确认项目公钥、原私钥、锁与main/preload摘要；不能改manifest绕过验证 |
| 同版本内容冲突 / 旧版本提升 | 不覆盖，改发更高版本修复包；同版只允许完全相同内容重发 |
| 发布锁遗留 | 先确认无发布进程，检查该namespace的.publish-lock；不自动删除活跃锁 |
| NSIS差分失败 | 确认旧新blockmap都在、大Range头与保序multipart206通过；不要把回退整包算差分成功 |
| 下载/安装授权失败 | 客户端可取消/重试；UOS确认实际包管理器与授权环境 |

renderer首次启动失败在12秒超时或下次启动回退上一正常资源；服务端推广旧版本会拒绝，需要发布更高资源版本的修复包。全量安装器没有同等自动回滚承诺；服务代码回退、客户端资源回退与应用数据迁移分别处理。不要手改current/签名文件伪造版本。

长期保留原keys、公开配置、完整data、renderer基线和manifest；生产备份应可恢复验证。构建缓存、已复制且验收的incoming可清理，先列出范围再删除；本机与生产的正式数据不能当临时缓存。协议依据：[electron-builder v26更新文档](https://www.electron.build/v26/docs/features/auto-update/)。本机实现与历史验收见 [specs/001-local-update-service/tasks.md](specs/001-local-update-service/tasks.md)。
