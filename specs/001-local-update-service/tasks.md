# Tasks

- [x] T001 读取既有客户端/协议与上游实现，保留Git基线，确认本机部署。
- [x] T002 统一只读服务、不可变发布/原子指针、单多Range及项目隔离。
- [x] T003 生成独立签名密钥，写入两客户端模板配置；初始化与常驻服务。
- [x] T004 真实差分下载器、签名资源和两客户端端到端回归，发布本机基线。
- [x] T005 独立审查、修复、文档和本机服务健康验证。

T006 Git交付事务：服务端新增commit及新私有仓库，两客户端各新增commit推送原分支；最终凭git log与远端ref回执，不改写基线，不把私钥或包数据提交Git。

## 2026-11-14 本机执行证据

- Server 12项独立测试通过：真实GenericDifferentialDownloader重建1600blocks、跨500段批次、20KB请求头，无整包fallback；旧新blockmap URL均命中；覆盖单多Range/HEAD/416、中途断开、同版覆盖、并发锁、坏签名/hash、读写路径链接及私钥/信任保护。
- 2项实际同级客户端合同测试通过：分别调用真实pack-resources生成schema2→服务发布→真实HTTP→该客户端原ResourceUpdateController完成patch暂存/目标树校验和snapshot回退。
- 两客户端各41项单元、6项端到端、1项HMR通过；HMR后恢复production，3组ASAR全部dist字节与源码编译结果一致，公钥配置/运行时与本机发布清单吻合。没有重复执行本批未改核心的Windows原生安装；既有003结果为历史证据，不冒充新增UOS认证。
- 常驻服务LaunchAgent已安装，127.0.0.1:25565/healthz返回ok；Win x64、UOS x64/arm64完整包与签名renderer1.0.0基线均发布。逐目标通过实际服务读取完整清单、206 Range、资源签名和ZIP SHA256；初始同版本无更新是正常状态。
- 公私钥实际生成：两项目独立，私钥在~/.config/electron-update-server/keys（600/目录700），客户端只携带公钥。已有信任下私钥缺失/不匹配会拒绝，只有明确new-deployment可重配客户端信任，不覆盖原私钥。
- 独立非实现者关闭密钥/发布父目录symlink阻塞；实际隐藏存储路径403反例红→绿后，sendFile显式相对root且保留dotfile与safeFile保护。复核无剩余代码阻塞。
- Docker compose配置语法通过；本轮运行的是原生LaunchAgent，未构建或运行Docker镜像。

源码与规格保留；真实keys/config/data与renderer基线长期保留。临时日志集中/tmp/electron-update-service-20261114，资源中转ZIP验收后清理。GitHub私有仓库已创建，T006实际交付回执以git log/远端ref为准；不发布公网或GitHub Release。
