# 掌间星尘 · PALMFIELD

一个在浏览器中运行的手势与音乐互动粒子空间。

- 摄像头手势：张掌散开、握拳聚合、移动手掌旋转。
- 六种粒子形态：星系、球体、土星、爱心、圆环、双螺旋。
- 音乐星空：内置 NEON DRIVE，也能导入本机音频。
- 128 BPM 立体声电子试听，粒子跟随低、中、高频变化。
- 视频录制：保存粒子画面与音乐，最长 30 秒。
- 鼠标、触屏、配色与粒子数量控制。

## 使用

打开 GitHub Pages 地址后，点右上角「音乐星空」试听，
或点底部「开启手势」授权摄像头。请用支持 WebGL 的现代浏览器。
首次开启手势会下载模型与识别引擎，右侧显示进度，也可以随时取消。

摄像头和导入的音乐都在浏览器本地处理，不上传。
摄像头只在你点击授权后开启；关闭手势或离开页面会停止摄像头。
视频录制仅包含粒子画面和当前音乐，不包含摄像头预览。

所有运行时脚本、WASM、手部模型和内置音乐均包含在仓库中。
页面运行不需要连接 ChatGPT，也不依赖第三方 CDN。

## 本地运行

在本目录启动静态 HTTP 服务，例如 Python 3：

    python -m http.server 8000 --bind 127.0.0.1

然后访问 http://127.0.0.1:8000/ 。
请通过 HTTPS 或 localhost 使用摄像头，直接双击 HTML 不适合运行模块与识别引擎。

## 文件

- index.html / style.css / music.css：界面与响应式样式
- app.js / shapes.js：WebGL 粒子和形态
- hand-worker.js / camera-startup.js：本地识别与连接流程
- music.js：音频分析、播放器、视频导出
- vendor/：Three.js、MediaPipe、模型与许可
- assets/neon-drive.mp3：为本项目制作的原创电子试听

第三方许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。
