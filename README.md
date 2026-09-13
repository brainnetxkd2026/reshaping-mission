# 重塑使命 · 联机对战

战争题材俯视角射击游戏。支持单机战役（泥泞/雪原/城市/行政大厅剧情）与**公网联机 PvP 对战**。

## 本地单机玩
直接双击打开 `index.html` 即可（单机存档保存在浏览器本地）。

## 本地联机（同一 Wi-Fi）
1. 安装 Node.js（https://nodejs.org，LTS 版即可）
2. 在本目录打开终端，运行：`node server.js`
3. 本机浏览器访问 `http://localhost:8123`，进主页点【联机对战】
4. 同网络的朋友浏览器访问 `http://你的局域网IP:8123`（启动服务器时终端会打印），同样点【联机对战】
5. 填昵称 → 连接服务器 → 大厅 → 开始对局，互相可见、可互射，击杀计分

## 公网联机（Render 部署）
1. **推送到 GitHub**（首次需登录 GitHub）：
   ```
   git remote add origin https://github.com/你的用户名/重塑使命.git
   git branch -M main
   git push -u origin main
   ```
2. **Render 部署**（https://render.com，可用 GitHub 一键登录）：
   - New → Web Service → Connect 你的 GitHub 仓库
   - Name：`reshaping-mission`（随意）
   - Build Command：留空
   - Start Command：`node server.js`
   - Instance Type：Free
   - Create Web Service，等待部署完成（约 1 分钟）
3. 部署完成后得到地址 `https://reshaping-mission.onrender.com`
4. 所有人浏览器访问该地址 → 【联机对战】→ 服务器地址填 `https://reshaping-mission.onrender.com` → 连接

> 注意：
> - 免费实例闲置约 15 分钟会休眠，首个访问者需等待约 30~60 秒唤醒。
>   想保持常驻可用 UptimeRobot 免费服务每 5 分钟 Ping 一次。
> - 玩家昵称即头顶显示的玩家 ID；击杀 +10 分，死亡可重新部署继续作战。

## 文件
- `index.html` — 游戏本体（单文件，含联机前端）
- `server.js` — 联机服务器（零依赖 Node.js，Render 可直接部署）
