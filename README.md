# 布布爱一二

一个 3D 太阳系互动可视化，送给布布和一二。基于 **React 19** + **Three.js**（`@react-three/fiber`）+ **Vite 7** 构建。

## 功能

- 太阳：核心球体 + 双层日冕 shader（内层紧密、外层弥散，随时间脉冲）
- 6 颗行星（水星 → 土星）：公转轨道、自转、轴倾角、轨迹拖尾
- 地球：自定义 shader，昼夜贴图混合 + 云层 + 法线凹凸 + Fresnel 蓝色大气辉光；环绕的月球
- 土星环：Canvas 生成的渐变环纹理
- 后期处理：Bloom + Vignette（`multisampling={0}`，规避黑屏问题）
- 银河天空盒背景 + 星空粒子
- 点击行星：HUD 信息面板 + 相机平滑跟随

## 命令

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器（HMR）
npm run build      # 类型检查 + 生产构建
npm run preview    # 本地预览生产构建
npm run deploy     # 构建并部署到 GitHub Pages
```

## 技术要点

- `vite.config.ts` 设 `base: './'`，资源走相对路径，可部署到任意子路径
- `babel-plugin-react-compiler` 启用自动 memoization
- 已知问题：Bloom + Vignette 组合在默认 `EffectComposer` 下会黑屏，已通过 `multisampling={0}` + `eskil={false}` 修复
