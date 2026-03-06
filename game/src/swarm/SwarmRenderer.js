import * as THREE from 'three';
import { STATES } from './BoidSystem.js';

const _dummy = new THREE.Object3D();
const _lookDir = new THREE.Vector3();

export class SwarmRenderer {
  constructor(scene, boidSystem) {
    this.boids = boidSystem;
    this.count = boidSystem.count;

    // Drone geometry: thin elongated cone (low-poly)
    const geo = new THREE.ConeGeometry(0.22, 1.0, 4);
    geo.rotateX(Math.PI / 2); // point forward +Z

    // Material with emissive glow
    this.mat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Per-instance color buffer (for group tinting & overload flash)
    this.colorArray = new Float32Array(this.count * 3);
    this._initColors();
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colorArray, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this._time = 0;
    this._flashT = 0;
  }

  _initColors() {
    for (let i = 0; i < this.count; i++) {
      // Base: teal-green
      this.colorArray[i*3]   = 0.0;
      this.colorArray[i*3+1] = 1.0;
      this.colorArray[i*3+2] = 0.67;
    }
  }

  flash() {
    this._flashT = 0.3; // seconds of white flash
  }

  update(dt) {
    this._time += dt;
    this._flashT = Math.max(0, this._flashT - dt);
    const isOverload = this.boids.state === STATES.OVERLOAD;
    const isSplit = this.boids.state === STATES.SPLIT;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      _dummy.position.set(
        this.boids.positions[i3],
        this.boids.positions[i3+1],
        this.boids.positions[i3+2]
      );
      _lookDir.set(
        this.boids.velocities[i3],
        this.boids.velocities[i3+1],
        this.boids.velocities[i3+2]
      ).normalize();
      // Orient cone toward velocity
      _dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), _lookDir);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);

      // Color update
      if (this._flashT > 0) {
        // White flash on voice command
        const t = this._flashT / 0.3;
        this.colorArray[i3]   = t * 2.5;
        this.colorArray[i3+1] = 2.5;
        this.colorArray[i3+2] = t * 2.5;
      } else if (isOverload) {
        // Pulsing extreme white in overload
        const pulse = (Math.sin(this._time * 30 + i * 0.1) + 1) * 0.5;
        this.colorArray[i3]   = 1.5 + pulse * 1.5;
        this.colorArray[i3+1] = 1.2 + pulse * 1.5;
        this.colorArray[i3+2] = 1.0 + pulse * 1.5;
      } else if (isSplit) {
        // Left=cyan, Right=orange
        if (this.boids.groups[i] === 1) {
          this.colorArray[i3] = 0; this.colorArray[i3+1] = 0.8; this.colorArray[i3+2] = 1.0;
        } else {
          this.colorArray[i3] = 1.0; this.colorArray[i3+1] = 0.4; this.colorArray[i3+2] = 0;
        }
      } else {
        // Normal teal (slightly darker so overload pops more)
        this.colorArray[i3] = 0; this.colorArray[i3+1] = 0.7; this.colorArray[i3+2] = 0.4;
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
