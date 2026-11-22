# Kaeto Community

可自建的视觉小说社区。支持作品资料、游玩打卡与评分、评论和通知、公开或协作清单、资历卡草稿与本地 PNG 导出，以及可选的外部数据来源。

## 五分钟试用

需要 Node.js 22 或更新版本。

```sh
npm ci
cp config.example.json config.json
npm run admin -- demo-admin
npm run demo
npm start
```

Windows PowerShell 可用 `Copy-Item config.example.json config.json`。打开 `http://127.0.0.1:8787`。演示脚本向新的本地数据目录写入三部虚构作品和对应的打卡记录。安装完成后的演示无需外部 API、数据库服务器或邮箱。

管理员初始化命令在用户表为空时创建首位管理员，并在当前终端显示随机生成的初始密码。妥善保存该密码后启动应用，前往 `/login` 登录体验后台。普通自建实例可跳过演示数据。

```sh
npm run check
```

检查使用独立配置、临时数据和模拟邮件，不使用真实凭据。公开版的资料快照是空结构，运营者可按来源规则配置自己的数据接口。活动、群刊和原作专页的站点内容由运营者自行提供。

## 自建部署

参阅 [部署说明](deploy/README.md)。程序只应有一个写入进程。使用 PostgreSQL 时，在私有配置中填写 `database.url` 或向服务提供 `DATABASE_URL`。日常开发可使用本地 JSON。

## 许可

项目代码及自制占位素材使用 [MIT License](LICENSE)。内置字体、第三方服务、站点内容和品牌见 [第三方声明](THIRD_PARTY_NOTICES.md)。
