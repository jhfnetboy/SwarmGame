import * as THREE from 'three';

export class BackgroundStars {
  constructor(scene, count = 12000) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const brightness = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute on a large sphere shell
      const r = 400 + Math.random() * 200;
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      positions[i*3]   = r * Math.sin(theta) * Math.cos(phi);
      positions[i*3+1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i*3+2] = r * Math.cos(theta);
      sizes[i] = 0.5 + Math.random() * 2.5;
      brightness[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._t = 0;
    this._mat = mat;
  }

  update(dt) {
    // Slow rotation to create drift effect
    this._t += dt;
    this.points.rotation.y += dt * 0.003;
    this.points.rotation.x += dt * 0.001;
    // Subtle opacity pulse
    this._mat.opacity = 0.7 + Math.sin(this._t * 0.4) * 0.15;
  }
}
