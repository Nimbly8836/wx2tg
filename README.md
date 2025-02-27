# 简介

微信转发到 Telegram，依赖大佬开放出来的 iPad 协议实现的小工具。
运行前要 https://github.com/Devo919/Gewechat 能正常使用才行。

## 关于

正在开发中...

支持消息：

- 文本
- 引用消息
- 红包消息
- 图片
- 视频
- 表情包
- 文件

暂时不支持的消息：

- 语音
- 小程序

## 部署

注意事项：

1. Gewechat 服务可能需要和你在同省运行
2. 必须使用 Telegram 的 API_ID & API_HASE，请注意使用 User Bot 可能会增加你被封号的概率
3. 数据库使用 PG 数据库

常见问题：

无法登陆没有二维码出来：

1. 命令 /rmds 删除微信保存的缓存文件
2. 手机退出 iPad 微信
3. 重启 gewe 容器
4. 还是无法登陆多试几次

设置回调地址失败：

1. 设置 GEWE_IP 环境变量；例如：用 docker 运行的 gewe 容器，设置成宿主机局域网的 IP （192.168.x.x 之类的）
2. 重启服务

docker-compose 运行：

1. 复制 .env.example 到 .env 并且修改你的配置
2. 按照你的配置运行下面任意一个命令

```shell
docker compose up -d

docker-compose up -d

podman compose up -d

podman-compose up -d
```

## 使用

第一次使用：

1. /start 按照提示扫码登录 TG
2. /login 登陆微信

相关命令介绍：

- /user 搜索联系人，支持模糊 用户名、全拼小写、简称拼音大写查询；在 BOT 的聊天手动创建群聊绑定这个联系人；在群聊更换绑定或者绑定当前群
- /room 搜群同上
- /sc 搜索wx2tg发送和接收的所有消息；是超级群并且群聊记录对新成员可见的时候能跳转
- /sw 切换群组转发状态；关闭的时候停止接收和转发消息
- /sync 同步联系人或者群组消息；当头像和名称变化的时候会自动更新
- /fu 同上但是强制更新头像
- /ala 添加当前群能转发的实体；目前支持机器人和用户。支持写 id 或者 @
  ，所有人的id定义为1，当所有人存在的时候可以在id或者@前面加 '-' 来排除
- /al 列出当前群能转发的列表，点击删除
- /roomml 查看群聊所有成员的信息，支持搜索
- /info 查看当前绑定的用户信息
- /check 检查微信连接状态

## 开发

1. 安装依赖

```shell
npm install
```

node 要 20 以上

2. 修改配置文件

```shell
cp .env.example .env
```

3. 初始化数据库

```shell
npm run init-db
```

4. 启动

```shell
npm run dev
```

## 暂时无法解决的问题

1. 消息丢失
2. 语音文件无法下载