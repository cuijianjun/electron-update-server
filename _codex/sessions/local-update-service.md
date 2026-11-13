# README 发布/更新/上线指南 — 2026-11-14
目标：三个repo README写清打包/全量/增量、server部署配置，验证后GitHub；本轮不实际部署公网。
Server /Users/cjjxw/study/yz/electron-update-server，agent/update-server-main@09a4704入场clean；同级win979c217/uosb1adf2e，均agent/vue3-upgrade-main clean。只改各README和既有card，不改业务/依赖/本地源/版本/密钥。
文档完成：Linux Docker+宿主Nginx HTTPS部署，原public config/data迁移(私钥留发布机)，UID与只读mount，SSH暂存后CLI发布，三目标元数据/Range/签名归档验收，服务管理/备份/修复发高版本；client文档含所有构建与基线命令。
本批验证：3份README的shell/JSON/代码围栏/本地链接/diff-check通过；URL脚本在隔离config验证HTTPS/拒绝HTTP/保留公钥和占位符，server配置迁移及compose插值通过，npm version在scratch同步package+lock通过。server12test+动态client contract2新执行通过；README Nginx模板在临时可信测试CA/TLS代理下，三目标metadata/HEAD/single+multiRange/资源签名与ZIP hash通过；21005字节Range头500片段保序通过。临时Nginx已停止，日常服务未变。Docker只验证compose，未build/run image；未部署公网或执行新目标机安装。
复核修复：固定1.0.0 E2E/packaged限制明确，升版本后改用动态联调+实际目标机验收；新基线按project/platform-arch/runtime/version隔离并保存manifest，原1.0.0旧布局不搬动。公网切换保留原trust，旧localhost客户端需首次新安装/手改公开配置；两发布事务独立。
本机deployment保留：LaunchAgent com.cjjxw.electron-update-server，127.0.0.1:25565；config/keys ~/.config/electron-update-server(独立Ed25519)，data/log/旧基线 ~/.local/share/electron-update-server。3目标1.0.0已发布；服务和key/data不可删。
历史各client41unit/6e2e/HMR1/3包HTTP不冒充本轮新测；UOS001 T017/T022/T023未闭。新临时验证/tmp/electron-update-readme-20261114可清理；原VM/其他任务/Codex历史不动。
独立只读review完成，无剩余阻塞；已修复两项文档问题并加专用shell失败即停。各repo一个docs commit并SSH推既有工作分支；server main仍为09a4704时可快进同步，最终结果查git log/status/ls-remote，不记自引用hash，不改写历史。Node24.22.0/npm11.19.1子进程PATH。
