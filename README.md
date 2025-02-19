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


## 开发

1. 安装依赖

```shell
npm install
```

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