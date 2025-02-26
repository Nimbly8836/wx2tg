# 简介

微信转发到 Telegram
必须用 user bot，运行前要 https://github.com/Devo919/Gewechat 能正常使用才行。

## 关于

正在开发中... 还有很多问题，请谨慎使用。


支持消息：

- 文本
- 引用消息
- 红包消息
- 图片
- 视频
- 文件


暂时不支持的消息：

- 语音
- 表情包
- 小程序

其他正在开发中...

## 部署

注意事项：
1. Gewechat 服务必须在和你同省
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
2. 运行

```shell
docker compose up -d

docker-compose up -d

podman compose up -d

podman-compose up -d
```

## 使用




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