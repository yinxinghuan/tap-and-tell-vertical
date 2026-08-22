# Technical

## 1. 技术栈

- 游戏：Tap & Tell · Vertical
- 类型：social
- 简述：Tap a frame, tell what happens next — vertical 3:4 cinematic continuation. AlterU 系列 v2.0 — full social loop with TikTok-style swipeable wall.
- 框架 / 语言 / 构建：React, TypeScript, Vite, Less
- 渲染方式：React DOM + Less；图片和视频由 `<img>` / `<video>` 渲染，触点用 DOM 坐标归一化，无 Canvas/WebGL 主循环。
- 依赖摘录：@types/react@^18.2.0, @types/react-dom@^18.2.0, @vitejs/plugin-react@^4.2.1, less@^4.2.0, react@^18.2.0, react-dom@^18.2.0, typescript@^5.3.3, vite@^5.1.0
- 平台元信息：meta.title=Tap & Tell · Vertical；cover_url=/poster.png；category=social；uuid=cb8f8e93-9239-4720-bcd3-5b54cae9edee

## 2. 目录结构

- `index.html`：Vite/浏览器入口，挂载根节点和基础 meta。
- `package.json`：定义 npm 脚本、依赖和工程名称。
- `vite.config.ts`：配置构建、插件和相对路径 base。
- `meta.json`：平台发布元信息，包含标题和封面。
- `src/App.tsx`：React 组件和交互界面。
- `src/main.tsx`：React 组件和交互界面。
- `src/index.less`：视觉样式、布局、动画和响应式规则。
- `src/shared.d.ts`：游戏源码模块。
- `src/vite-env.d.ts`：游戏源码模块。
- `src/game-id.ts`：游戏源码模块。
- `src/shared/runtime/useGameStats.ts`：游戏源码模块。
- `src/shared/runtime/useUpload.ts`：游戏源码模块。
- `src/shared/runtime/useChat.ts`：游戏源码模块。
- `src/shared/runtime/useGenImage.ts`：游戏源码模块。
- `src/shared/runtime/media.ts`：AlterU 独立媒体服务图片/视频公开客户端、幂等请求和结构化错误。
- `src/shared/runtime/bridge.ts`：游戏源码模块。
- `src/shared/runtime/game-id.ts`：游戏源码模块。
- `src/shared/runtime/useGameEvent.ts`：游戏源码模块。
- `src/shared/runtime/index.ts`：游戏源码模块。

关键源码模块：

- `src/App.tsx`
- `src/main.tsx`
- `src/index.less`
- `src/shared.d.ts`
- `src/vite-env.d.ts`
- `src/game-id.ts`
- `src/shared/runtime/useGameStats.ts`
- `src/shared/runtime/useUpload.ts`
- `src/shared/runtime/useChat.ts`
- `src/shared/runtime/useGenImage.ts`
- `src/shared/runtime/bridge.ts`
- `src/shared/runtime/game-id.ts`
- `src/shared/runtime/useGameEvent.ts`
- `src/shared/runtime/index.ts`
- `src/shared/save/useGameSave.ts`
- `src/shared/save/index.ts`
- `src/TapAndTell/Demo.tsx`
- `src/TapAndTell/TapAndTell.tsx`
- `src/TapAndTell/Demo.less`
- `src/TapAndTell/TapAndTell.less`
- `src/TapAndTell/utils/useWallEntries.ts`
- `src/TapAndTell/utils/genImageWithRetry.ts`
- `src/TapAndTell/utils/aiHelpers.ts`
- `src/TapAndTell/utils/prompts.ts`
- `src/TapAndTell/utils/videoApi.ts`：固定五秒 9:16 视频提交、任务恢复、至少十秒轮询和结构化退避。

## 3. 核心模块

- 状态管理与节奏：`TapAndTell.tsx` 用 React state 管理 home、gen-a、tap、gen-b、gen-video、play、wall 与 error 阶段；加载 teaser 每 4.5 秒轮换。
- 渲染方式：DOM/Less 渲染 3:4 交互窗口；576×1024 图片和 9:16 视频以 `object-fit: cover` 裁切，不拉伸资源。
- 触点 / 更新：Pointer 坐标归一化为 0–1 的 `tap_x/tap_y`，没有碰撞、得分、生命或实时物理循环。
- 音频：未发现独立音频模块，当前以视觉和文案反馈为主。
- 多语言：包含 i18n / locale 检测或 `t()` 文案函数。
- 存储：`useGameSave` 保存已发布故事归档；`alteruLocalStorage` 缓存待恢复媒体任务，真实 key 由当前部署 UUID 隔离。
- Aigram 运行时：接入 `@shared/runtime` 或平台桥接能力，用于用户、资料页、分享、通知或平台 API。
- AI / 生成接口：LLM 仍走既有 `game-chat` 生成分镜；图片和视频统一走 AlterU 独立媒体服务。图片使用 text/edit 和 576×1024，玩家身份直接引用原始头像；视频固定 9:16、5 秒、有环境声，任务 ID 持久化并可刷新恢复。失败保留 B 帧静态结果。
- 社交墙 / 归档：包含 wall、gallery、feed 或 archive 数据流与浏览界面。

## 4. 扩展点

- 改玩法参数：优先查找 `src/` 内大写常量、hooks、主组件顶部配置或关卡数组。
- 换素材：替换 `public/`、`src/img/` 或源码 import 的图片/音频文件，并保持相对路径。
- 调视觉：修改主样式文件中的颜色、间距、动画时长、网格尺寸和响应式规则。
- 改文案：修改 i18n 字典、组件内标题按钮文案，保持 zh/en 同步。
- 加平台能力：在已有 `@shared/runtime`、useGameSave、排行榜、墙或通知调用附近扩展，避免另起一套存储。
- 调媒体协议：修改 `src/shared/runtime/media.ts`；调图片身份、尺寸与恢复 UI 修改 `useGenImage.ts` 和 `TapAndTell.tsx`；调视频动作、环境声、轮询和重试修改 `utils/videoApi.ts`。
