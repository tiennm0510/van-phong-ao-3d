import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// Project rooms use the same Three.js and robot/desk vocabulary as the legacy
// office, but their identity comes from persisted projects instead of sessions.
export function createOfficeScene(container, onSelect) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.append(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
  container.append(labels.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = 1.28; controls.minDistance = 12; controls.maxDistance = 260;
  scene.add(new THREE.HemisphereLight(0xe3fff1, 0x5a7262, 2));
  const sun = new THREE.DirectionalLight(0xffedd5, 3);
  sun.position.set(-18, 35, 15); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 150 });
  sun.shadow.normalBias = .06; scene.add(sun);
  const rooms = new Map(), selectable = [];
  let count = 0, selected = null;
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
  const mesh = (parent, geo, mat, x, y, z) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (parent, x, y, z, w, h, d, color, extra) => mesh(parent, new THREE.BoxGeometry(w, h, d), material(color, extra), x, y, z);
  function reset() {
    const columns = Math.min(Math.max(count, 1), 3), rows = Math.ceil(Math.max(count, 1) / 3);
    const center = new THREE.Vector3((columns - 1) * 8.5, 0, (rows - 1) * 7);
    let distance = Math.max(22, columns * 12, rows * 15);
    controls.target.copy(center).add(new THREE.Vector3(0, 1, 0));
    // Fit the actual room bounds in both axes, including portrait screens.
    for (let attempt = 0; attempt < 8; attempt++) {
      camera.position.copy(center).add(new THREE.Vector3(distance * .63, distance * .82, distance));
      controls.update(); camera.updateMatrixWorld();
      let ratio = 0;
      for (const x of [-8, (columns - 1) * 17 + 8]) for (const y of [0, 6]) for (const z of [-7, (rows - 1) * 14 + 7]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        ratio = Math.max(ratio, Math.abs(p.x) / .86, Math.abs(p.y) / .78);
      }
      if (ratio <= 1) break;
      distance *= ratio * 1.03;
    }
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); labels.setSize(w, h);
  }
  new ResizeObserver(() => { resize(); reset(); }).observe(container);
  resize(); reset();
  function room(project, employee, index) {
    const g = new THREE.Group(); g.position.set((index % 3) * 17, 0, Math.floor(index / 3) * 14); scene.add(g);
    const floor = box(g, 0, -.35, 0, 15.7, .6, 12.8, 0xb4b3a0);
    floor.userData.projectId = project.id; selectable.push(floor);
    box(g, 0, -.02, 0, 15, .07, 12, 0xb68c63);
    for (let i = -6; i <= 6; i += 2) box(g, i, .022, 0, .025, .015, 12, 0x8e7457);
    box(g, 0, .07, -.5, 11.5, .04, 8.5, 0x728a79);
    box(g, 0, 1.7, -6, 15.3, 3.4, .22, 0xd0d8c6);
    box(g, -7.5, 1.7, 0, .22, 3.4, 12, 0xc7d3c5);
    box(g, 7.5, .7, 0, .1, 1.4, 12, 0x96b5ae, { transparent: true, opacity: .3 });
    // Desk, monitor, keyboard and chair.
    box(g, -.5, 2, -2, 5.1, .22, 2.4, 0xe3cfab);
    for (const x of [-2.5, 1.5]) box(g, x, 1, -2, .15, 2, 1.9, 0x304943);
    box(g, -.5, 2.85, -2.65, 2.2, 1.25, .18, 0x293a36);
    const screen = box(g, -.5, 2.85, -2.54, 1.95, 1, .04, 0x346b5a, { emissive: 0x346b5a, emissiveIntensity: .4 });
    box(g, -.5, 2.1, -1.5, 1.5, .06, .5, 0x34473f);
    box(g, 1.2, 2.3, -1.6, .35, .5, .35, 0xe8ebdc);
    box(g, -.5, .8, .5, 1.8, .16, 1.8, 0x354d43);
    box(g, -.5, 1.6, 1.3, 1.8, 1.4, .2, 0x354d43);
    // Plant and storage shelf.
    mesh(g, new THREE.CylinderGeometry(.55, .4, .8, 12), material(0xe2d2b0), 5.7, .4, -4.5);
    mesh(g, new THREE.ConeGeometry(1, 2.4, 9), material(0x4a7856), 5.7, 1.9, -4.5);
    box(g, -5.5, 1, -4.4, 2, 2, 1.2, 0xc4b38d);
    for (let i = 0; i < 5; i++) box(g, -6.1 + i * .26, 1.9, -4.4, .17, .7 + (i % 2) * .2, .6, [0x6d8875, 0xc9936e, 0xb4bd95][i % 3]);
    // Robot character derived from the legacy office's capsule, visor and ring.
    const bot = new THREE.Group(); bot.position.set(1, 0, 2); g.add(bot);
    mesh(bot, new THREE.CapsuleGeometry(.43, .65, 6, 12), material(0xdce8de), 0, 1.05, 0);
    mesh(bot, new THREE.SphereGeometry(.5, 16, 12), material(0xe7eee5), 0, 1.95, 0);
    box(bot, 0, 1.95, .43, .65, .27, .1, 0x21463e, { emissive: 0x3e7d68, emissiveIntensity: .3 });
    for (const x of [-.16, .16]) box(bot, x, 1.97, .5, .07, .07, .03, 0xb6ffe1, { emissive: 0xb6ffe1, emissiveIntensity: 1 });
    const arms = [-1, 1].map(x => mesh(bot, new THREE.CapsuleGeometry(.12, .43, 4, 8), material(0xafc6b8), x * .55, 1.12, .1));
    const ring = mesh(bot, new THREE.RingGeometry(.8, .9, 32), new THREE.MeshBasicMaterial({ color: 0x8da59b, side: THREE.DoubleSide }), 0, .08, 0);
    ring.rotation.x = -Math.PI / 2;
    const statusLight = box(g, 0, .12, 5.8, 9, .05, .08, 0x698a7b, { emissive: 0x698a7b, emissiveIntensity: .8 });
    const label = document.createElement("button"); label.type = "button";
    Object.assign(label.style, { pointerEvents: "auto", padding: "7px 12px", borderRadius: "7px", background: "#172b26e6", border: "1px solid #5b7c6a", color: "#edf5e9", textAlign: "center", maxWidth: "170px", fontSize: "11px" });
    const title = document.createElement("strong"), subtitle = document.createElement("small");
    Object.assign(subtitle.style, { display: "block", fontSize: "9px", marginTop: "4px", color: "#adc4b5" });
    label.append(title, subtitle); label.onclick = () => onSelect(project.id);
    const lo = new CSS2DObject(label); lo.position.set(0, 5, -4); g.add(lo);
    const item = { g, bot, arms, ring, screen, statusLight, label, title, subtitle, active: false, target: new THREE.Vector3(1, 0, 2) };
    rooms.set(project.id, item); return item;
  }
  const clock = new THREE.Clock();
  function animate() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    for (const r of rooms.values()) {
      r.bot.position.lerp(r.target, Math.min(1, dt * 2));
      r.bot.rotation.y = r.active ? Math.PI : -.35;
      r.arms.forEach((arm, i) => { arm.rotation.x = r.active ? -.6 + Math.sin(t * 9 + i * Math.PI) * .2 : Math.sin(t * 2 + i) * .04; });
      r.screen.material.emissiveIntensity = r.active ? .7 + Math.sin(t * 4) * .15 : .2;
    }
    controls.update(); renderer.render(scene, camera); labels.render(scene, camera); requestAnimationFrame(animate);
  }
  animate();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down;
  renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects(selectable)[0]; if (hit) onSelect(hit.object.userData.projectId);
  });
  return {
    reset,
    update(state, selectedId) {
      selected = selectedId;
      state.projects.forEach((p, index) => {
        const employee = state.employees.find(e => e.projectId === p.id);
        const r = rooms.get(p.id) || room(p, employee, index);
        const tasks = state.tasks.filter(t => t.projectId === p.id);
        r.active = tasks.some(t => ["preparing", "running", "stopping"].includes(t.status));
        const waiting = tasks.some(t => ["awaiting_id", "needs_input", "blocked", "failed", "interrupted", "review"].includes(t.status));
        const color = r.active ? 0xb7e7b8 : waiting ? 0xecc582 : 0x88a094;
        r.ring.material.color.setHex(color); r.statusLight.material.color.setHex(color); r.statusLight.material.emissive.setHex(color);
        r.label.style.borderColor = p.id === selected ? "#d0efb9" : "#5b7c6a";
        r.title.textContent = p.name; r.subtitle.textContent = `${employee?.name || "Nhân viên"} · ${r.active ? "Đang làm" : waiting ? "Cần bạn" : "Sẵn sàng"}`;
        r.target.set(r.active ? -.5 : 1, 0, r.active ? -.1 : 2);
      });
      if (count !== state.projects.length) { count = state.projects.length; reset(); }
    },
  };
}
