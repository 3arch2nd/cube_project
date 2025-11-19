// foldEngine.js
// 큐브 전개도 및 접기 애니메이션 핵심 로직 (Babylon.js 기반) - 최종 완벽 안정화 버전

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;
    
    let engine = null;
    let scene = null;
    let cubeEngine = null;

    /**
     * CubeFoldEngine 클래스
     */
    class CubeFoldEngine {
        constructor(scene, size = 1.4) {
            this.scene = scene;
            this.size = size;
            this.faces = {}; 
            this.transforms = {}; 
            this.faceConfig = this.getFaceConfig(size); 
            this.baseTransform = null;
            this.camera = null;
            this.netCenter = { x: 0, y: 0 }; 
            this.faceMap = new Map(); 
        }

        /**
         * 큐브 접기 시나리오에 따른 각 면의 회전축, 각도, 부모 관계를 정의합니다.
         */
        getFaceConfig(size) {
            const halfSize = size / 2;
            const FACE_SIZE = size;
            
            return {
                // ID 1: Bottom (Base)
                1: { key: 'bottom', parentId: null, hingePos: BABYLON.Vector3.Zero(), localOffset: BABYLON.Vector3.Zero(), axis: null, angle: 0 },
                
                // ID 2: Front (Bottom에 연결)
                2: { 
                    key: 'front', parentId: 1, 
                    // Hinge Pos: Bottom의 앞쪽 모서리 (XZ평면 기준)
                    hingePos: new BABYLON.Vector3(0, 0, halfSize), 
                    // Face Mesh 로컬 오프셋: 힌지로부터 Z축 음수 방향으로 halfSize 이동 (펼쳐진 상태)
                    localOffset: new BABYLON.Vector3(0, 0, halfSize), 
                    axis: BABYLON.Vector3.Right(), angle: Math.PI / 2 
                },

                // ID 3: Back (Bottom에 연결)
                3: { 
                    key: 'back', parentId: 1, 
                    hingePos: new BABYLON.Vector3(0, 0, -halfSize), 
                    localOffset: new BABYLON.Vector3(0, 0, -halfSize), 
                    axis: BABYLON.Vector3.Left(), angle: Math.PI / 2 
                },

                // ID 4: Right (Bottom에 연결)
                4: { 
                    key: 'right', parentId: 1, 
                    hingePos: new BABYLON.Vector3(halfSize, 0, 0), 
                    localOffset: new BABYLON.Vector3(-halfSize, 0, 0), 
                    axis: BABYLON.Vector3.Backward(), angle: Math.PI / 2 
                },

                // ID 5: Left (Bottom에 연결)
                5: { 
                    key: 'left', parentId: 1, 
                    hingePos: new BABYLON.Vector3(-halfSize, 0, 0), 
                    localOffset: new BABYLON.Vector3(halfSize, 0, 0), 
                    axis: BABYLON.Vector3.Forward(), angle: Math.PI / 2 
                },

                // ID 6: Top (Front에 연결)
                6: { 
                    key: 'top', parentId: 2, 
                    // Front Hinge Transform을 기준으로 Z축을 따라 한 칸 이동한 위치
                    hingePos: new BABYLON.Vector3(0, 0, FACE_SIZE), 
                    localOffset: new BABYLON.Vector3(0, 0, halfSize), 
                    axis: BABYLON.Vector3.Right(), 
                    angle: Math.PI / 2 
                },
            };
        }

        /**
         * 2D 전개도 데이터의 중심 좌표를 계산합니다.
         */
        computeNetCenter(facesData) {
            let minU = Infinity, maxU = -Infinity;
            let minV = Infinity, maxV = -Infinity;

            facesData.forEach(f => {
                minU = Math.min(minU, f.u);
                maxU = Math.max(maxU, f.u + f.w);
                minV = Math.min(minV, f.v);
                maxV = Math.max(maxV, f.v + f.h);
            });

            this.netCenter.x = (minU + maxU) / 2;
            this.netCenter.y = (minV + maxV) / 2;
        }

        /**
         * 큐브 면과 회전축(TransformNode)을 생성하고 계층 구조를 설정합니다.
         */
        createCubeFaces(facesData) {
            this.disposeAll(); 
            this.computeNetCenter(facesData);
            this.faceMap.clear();
            facesData.forEach(f => this.faceMap.set(f.id, f));

            const faceColorMap = new Map(facesData.map(f => [f.id, BABYLON.Color3.FromHexString(f.color || "#cccccc")]));
            
            this.baseTransform = new BABYLON.TransformNode("cubeBase", this.scene);
            this.baseTransform.position = BABYLON.Vector3.Zero();

            const nodeMap = new Map(); 
            const size = this.size;

            for (const id in this.faceConfig) {
                const idNum = parseInt(id);
                const config = this.faceConfig[id];
                const faceData = this.faceMap.get(idNum);
                
                if (!faceData) continue; 

                // 2D 펼침 상태에서의 중심 3D 좌표 계산 (XZ 평면에 눕혀진 상태)
                const x = (faceData.u + faceData.w / 2 - this.netCenter.x) * size;
                const z = -(faceData.v + faceData.h / 2 - this.netCenter.y) * size; 
                const initialWorldPos = new BABYLON.Vector3(x, 0, z);

                
                // 1) Face Mesh 생성
                const face = BABYLON.MeshBuilder.CreatePlane(config.key, { size: size }, this.scene);
                face.rotation.x = Math.PI / 2; // XZ 평면에 눕히기 
                this.applyMaterial(face, faceColorMap.get(idNum), faceData._hidden);
                this.faces[config.key] = face;
                
                
                // 2) Hinge TransformNode 설정 및 연결
                if (idNum !== 1) {
                    // --- 힌지 구조 ---
