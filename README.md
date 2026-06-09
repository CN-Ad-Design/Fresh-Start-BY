# Fresh Start

一个为 Figma 设计师打造的一键画布清理插件。选中你的 Frame，一键清除隐藏元素、智能重命名图层、自动应用 Auto Layout，让杂乱的设计文件瞬间重获新生。

> 🎨 **体验地址：** [https://www.figma.com/community/plugin/1639609214562788106/fresh-start](https://www.figma.com/community/plugin/1639609214562788106/fresh-start)

## ✨ 功能

- **移除隐藏元素** — 自动删除被隐藏或超出容器范围的节点，清理视觉噪音
- **智能重命名** — 根据节点类型、角色、主色自动为图层生成语义化名称
- **Auto Layout 自动化** — 识别行列关系，将 Group 智能转换为带方向/内边距/间距的 Auto Layout Frame
- **结构展平** — 合并冗余的嵌套分组，减少层级深度
- **图像去重** — 移除重叠重复的图片，保留主视觉

## 🚀 快速开始

### 在 Figma 中使用

1. 打开任意 Figma 文件
2. 右键 → **Plugins** → **Fresh Start**（或从社区插件中搜索 "Fresh Start"）
3. 选中需要清理的 Frame 或 Group
4. 点击对应的功能按钮，享受自动整理的结果

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/CN-Ad-Design/Fresh-Start-BY.git
cd Fresh-Start-BY

# 安装依赖
npm install
```

在 Figma Desktop 中：

- **Plugins → Development → Import plugin from manifest**
- 选择项目根目录下的 `manifest.json`
- 在任意文件中运行 **Plugins → Development → Fresh Start**

## 📁 项目结构

```
.
├── code.js          # 插件主逻辑（节点操作、Auto Layout、重命名等）
├── ui.html          # 插件 UI（含 Apple 风格设计系统）
├── manifest.json    # Figma 插件清单
├── package.json
├── DESIGN.md        # UI 设计规范（Apple Style Reference）
└── mcp-analyzer/    # 可选的布局/问题检测模块（TypeScript）
```

## 🛠 技术栈

- **Vanilla JavaScript** — 无框架依赖，体积轻量
- **Figma Plugin API** — 原生节点操作
- **Apple-style 设计系统** — 极简留白、大字号、单一 CTA 蓝色

## 📝 License

MIT
