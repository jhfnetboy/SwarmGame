import * as THREE from 'three';

/**
 * Instanced Laser Beams
 * A pool of lasers that fly straight and fade out.
 */
export class LaserFX {
  constructor(scene, maxLasers = 2000) {
    this.maxLasers = maxLasers;
    this.count = 0;
    
    // Thin cylinder for laser
    const geo = new THREE.CylinderGeometry(0.1, 0.1, 5, 3);
    geo.rotateX(Math.PI / 2); // Point forward along Z
    
    // Normal laser material (bright cyan-green core)
    const matNormal = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 });
    this.meshNormal = new THREE.InstancedMesh(geo, matNormal, maxLasers);
    this.meshNormal.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meshNormal.frustumCulled = false;
    scene.add(this.meshNormal);

    // Overload laser material (thick, fiery orange-yellow core)
    const matOverload = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1.0 });
    this.meshOverload = new THREE.InstancedMesh(geo, matOverload, maxLasers);
    this.meshOverload.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meshOverload.frustumCulled = false;
    scene.add(this.meshOverload);
    
    // Custom data array: [px, py, pz, vx, vy, vz, life, isOverload] per laser
    this.data = new Float32Array(maxLasers * 8);
    this._dummy = new THREE.Object3D();
    this._lookDir = new THREE.Vector3();
  }

  /**
   * Fire a laser from `pos` in direction `dir`
   */
  fire(pos, dir, speed = 120, isOverload = false) {
    if (this.count >= this.maxLasers) return;
    
    const idx = this.count * 8;
    this.data[idx]   = pos.x; 
    this.data[idx+1] = pos.y; 
    this.data[idx+2] = pos.z;
    
    this.data[idx+3] = dir.x * speed; 
    this.data[idx+4] = dir.y * speed; 
    this.data[idx+5] = dir.z * speed;
    
    this.data[idx+6] = 1.0; // Life in seconds
    this.data[idx+7] = isOverload ? 1.0 : 0.0;
    this.count++;
  }

  update(dt) {
    if (this.count === 0) return;
    
    let aliveCount = 0;
    let normalIdx = 0;
    let overloadIdx = 0;
    
    for (let i = 0; i < this.count; i++) {
      const idx = i * 8;
      let life = this.data[idx+6];
      const isOverload = this.data[idx+7] > 0.5;
      
      life -= dt * (isOverload ? 3 : 2); // Overload fades faster
      
      if (life > 0) {
        // Move
        const vx = this.data[idx+3], vy = this.data[idx+4], vz = this.data[idx+5];
        this.data[idx]   += vx * dt;
        this.data[idx+1] += vy * dt;
        this.data[idx+2] += vz * dt;
        this.data[idx+6] = life;
        
        // Update matrix
        this._dummy.position.set(this.data[idx], this.data[idx+1], this.data[idx+2]);
        this._lookDir.set(vx, vy, vz).normalize();
        this._dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), this._lookDir);
        
        // scale based on life and type
        const t = (isOverload ? 8 : 1) * life; // Make overload laser much thicker
        this._dummy.scale.set(t, t, life * (isOverload ? 3 : 1));
        this._dummy.updateMatrix();
        
        if (isOverload) {
          this.meshOverload.setMatrixAt(overloadIdx++, this._dummy.matrix);
        } else {
          this.meshNormal.setMatrixAt(normalIdx++, this._dummy.matrix);
        }
        
        // Swap with aliveCount if needed to compact array
        if (i !== aliveCount) {
          for(let k=0; k<8; k++) this.data[aliveCount*8 + k] = this.data[i*8 + k];
        }
        aliveCount++;
      }
    }
    
    this.count = aliveCount;
    // Hide unused instances
    this.meshNormal.count = normalIdx;
    this.meshOverload.count = overloadIdx;
    if (normalIdx > 0) this.meshNormal.instanceMatrix.needsUpdate = true;
    if (overloadIdx > 0) this.meshOverload.instanceMatrix.needsUpdate = true;
  }
}

