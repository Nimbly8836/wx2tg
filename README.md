# 简介

微信转发到 Telegram
必须用 user bot，运行前要 https://github.com/Devo919/Gewechat 能正常使用才行。

## 关于
正在开发中，运行需要用我 fork 的 gewechaty 才行。
目前支持自动创建群组，创建文件夹。

支持消息：
- 文本
- 引用消息

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

## 