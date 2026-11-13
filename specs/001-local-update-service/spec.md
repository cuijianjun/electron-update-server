# 本机统一更新服务

用户已确认本机部署，服务支持Windows/UOS两个现有项目的全量和renderer增量，配置与Ed25519公私钥初始化，测试后提交GitHub。
项目/平台/架构/channel/运行时隔离；全量兼容electron-updater6.8.11元数据、不可变版本URL、旧新blockmap及多段Range；资源保持schema1/2原签名，不改archive字段，保留旧内容寻址归档。
本机发布CLI验证完整SHA512、资源签名/SHA256后原子切换current；同版本不同内容拒绝覆盖，并发锁不允许竞态发布。
每项目独立Ed25519私钥留在仓库之外，公钥和本机模板URL进入对应客户端。服务端只有只读HTTP接口，不加载私钥，不暴露文件系统或发布接口。
本机LaunchAgent保持服务运行。127.0.0.1仅用于服务与客户端同机；不声称其他设备或未知UOS真机已验收。不发布公网服务或GitHub Release。
