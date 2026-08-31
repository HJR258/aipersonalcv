# Hover Preview React integration

这是“神也要有简历”目录中的独立 React 组件实验区，不会覆盖根目录下已经完成的静态简历网站。

## 已确定的默认路径

- UI 组件：`components/ui`
- 全局样式：`src/index.css`
- 演示入口：`src/demo.tsx`
- `@` 别名：项目根目录，因此可使用 `@/components/ui/hover-preview`

`components/ui` 是 shadcn CLI 默认查找、生成和复用 UI 原语的位置。保持该目录可避免组件散落在业务页面中，并保证 `components.json` 中的别名、CLI 命令和示例导入路径一致。

## 运行

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
```

## 从空目录使用 shadcn CLI 配置同等项目

```bash
pnpm create vite@latest . --template react-ts
pnpm install
pnpm add -D tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
```

初始化时选择 Vite、TypeScript，并将组件别名保持为 `@/components`、UI 别名保持为 `@/components/ui`。Tailwind v4 的入口样式为 `src/index.css`，内容包含 `@import "tailwindcss";`。

## 组件分析

- 依赖：仅 React 自带的 `useState`、`useCallback`、`useRef` 和 `useEffect`。
- 状态：当前预览数据、浮层位置和显示状态均为组件局部状态，不需要 Context 或第三方状态库。
- 资源：使用组件中给出的三张 Unsplash 图片，挂载时预加载。
- 响应式：文字字号使用 `clamp()`；浮层会检测视口边缘。触屏设备没有 hover，后续若正式用于简历，建议将关键词改为可聚焦按钮并增加点击打开逻辑。
- 推荐位置：当前作为独立组件实验页展示。正式融入简历时，建议把三项数据替换为三个代表项目，用于“关于我”或“技术能力”章节中的关键词预览。
- 图标：当前组件没有 SVG 或图标需求，因此没有增加 `lucide-react`。
