// src/ThreeBackground.jsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 基础：场景 / 相机 / 渲染器
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    // 输出色彩空间 & 透明背景
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearAlpha(0);

    const setRendererSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    setRendererSize();
    container.appendChild(renderer.domElement);

    // —— 星野粒子 —— //
    // 根据屏幕面积动态调节数量（上/下限保护）
    const area = window.innerWidth * window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const density = dpr > 1 ? 0.0022 : 0.0016; // 每像素密度
    const starCount = Math.max(900, Math.min(3200, Math.floor(area * density)));

    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // 立方体分布（可改为球壳分布）
      positions[i * 3 + 0] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,                // 结合 sizeAttenuation，视觉柔和
      sizeAttenuation: true,    // 距离衰减
      transparent: true,
      opacity: 0.85,
      depthWrite: false,        // 避免遮挡开销
      blending: THREE.AdditiveBlending
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    // 动画：基于时间的轻微旋转（避免帧率波动导致的体感差异）
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta(); // 秒
      stars.rotation.x += 0.08 * dt; // 原先 0.0008/帧 → 这里换成时间制
      stars.rotation.y += 0.10 * dt; // 原先 0.001/帧
      renderer.render(scene, camera);
    });

    // 自适应：窗口尺寸 & DPR 变化
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      setRendererSize();
    };
    window.addEventListener("resize", handleResize);

    // 清理（StrictMode 安全）
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", handleResize);

      scene.remove(stars);
      geometry.dispose();
      material.dispose();

      renderer.dispose?.();
      if (renderer.forceContextLoss) renderer.forceContextLoss();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 层级：Three 在最底层，覆上一层 .bg-vignette，再是 .app-root
  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

