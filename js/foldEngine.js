// foldEngine.js
// 큐브 전개도 및 접기 애니메이션 핵심 로직 (Babylon.js 기반) - 최종 완성 및 안정화 버전

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
            
            // localOffset: Face Mesh가 Hinge Transform의 로컬 원점(0,0,0)을 기준으로 이동해야 할 위치입니다.
            // hingePos: Hinge Transform이 부모 노드(Bottom Face 또는 다른 Hinge)의 로컬 원점을 기준으로 이동해야 할 위치입니다.
            
            return {
                // ID 1: Bottom (Base)
                1: { key: 'bottom', parentId: null, hingePos: BABYLON.Vector3.Zero(), localOffset: BABYLON.Vector3.Zero(), axis: null, angle: 0 },
                
                // ID 2: Front (Bottom에 연결)
                2: { 
                    key: 'front', parentId: 1, 
                    hingePos: new BABYLON.Vector3(0, 0, halfSize), // Bottom의 앞쪽 모서리 (XZ평면 기준)
                    localOffset: new BABYLON.Vector3(0, 0, -halfSize), // Face Mesh는 힌지 뒤쪽으로 이동
                    axis: BABYLON.Vector3.Right(), angle: Math.PI / 2 
                },

                // ID 3: Back (Bottom에 연결)
                3: { 
                    key: 'back', parentId: 1, 
                    hingePos: new BABYLON.Vector3(0, 0, -halfSize), // Bottom의 뒤쪽 모서리
                    localOffset: new BABYLON.Vector3(0, 0, halfSize), // Face Mesh는 힌지 앞쪽으로 이동
                    axis: BABYLON.Vector3.Left(), angle: Math.PI / 2 
                },

                // ID 4: Right (Bottom에 연결)
                4: { 
                    key: 'right', parentId: 1, 
                    hingePos: new BABYLON.Vector3(halfSize, 0, 0), // Bottom의 오른쪽 모서리
                    localOffset: new BABYLON.Vector3(-halfSize, 0, 0), // Face Mesh는 힌지 왼쪽으로 이동
                    axis: BABYLON.Vector3.Backward(), angle: Math.PI / 2 
                },

                // ID 5: Left (Bottom에 연결)
                5: { 
                    key: 'left', parentId: 1, 
                    hingePos: new BABYLON.Vector3(-halfSize, 0, 0), // Bottom의 왼쪽 모서리
                    localOffset: new BABYLON.Vector3(halfSize, 0, 0), // Face Mesh는 힌지 오른쪽으로 이동
                    axis: BABYLON.Vector3.Forward(), angle: Math.PI / 2 
                },

                // ID 6: Top (Front에 연결)
                6: { 
                    key: 'top', parentId: 2, // 부모 ID: 2 (Front)
                    hingePos: new BABYLON.Vector3(0, FACE_SIZE, 0), // Front가 접혔을 때의 상단 모서리 (Front Hinge Transform 기준)
                    localOffset: new BABYLON.Vector3(0, -halfSize, 0), // Face Mesh는 힌지 아래쪽으로 이동 (Face의 Y축 방향)
                    axis: BABYLON.Vector3.Right(), angle: Math.PI / 2 
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
            
            // Base Transform은 큐브 전체를 담는 최상위 노드이며 (0, 0, 0)에 위치
            this.baseTransform = new BABYLON.TransformNode("cubeBase", this.scene);
            this.baseTransform.position = BABYLON.Vector3.Zero();

            const nodeMap = new Map(); // ID -> Node (Face 또는 Hinge Transform)
            const size = this.size;

            for (const id in this.faceConfig) {
                const idNum = parseInt(id);
                const config = this.faceConfig[id];
                const faceData = this.faceMap.get(idNum);
                
                if (!faceData) continue; 

                // 2D 펼침 상태에서의 중심 3D 좌표 계산 (XZ 평면에 눕혀진 상태)
                // (이전 버전의 정확한 2D 위치 계산 로직)
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
                    const hingeTransform = new BABYLON.TransformNode(`hinge_${config.key}`, this.scene);
                    this.transforms[config.key] = hingeTransform;

                    // Face는 Hinge의 자식. Face의 로컬 위치는 힌지 오프셋을 역으로 적용 (펼침 상태의 중심)
                    face.position.copyFrom(config.localOffset); 
                    face.parent = hingeTransform; 
                    nodeMap.set(idNum, hingeTransform); 

                    // Hinge 노드를 부모 노드에 연결
                    const parentConfig = this.faceConfig[config.parentId];
                    const parentNode = nodeMap.get(parentConfig.id) || this.baseTransform; 
                    hingeTransform.parent = parentNode;
                    
                    // Hinge 노드의 로컬 위치 설정 (2D 펼침 상태)
                    const parentWorldPos = parentNode.getAbsolutePosition();
                    const targetFaceWorldPos = initialWorldPos.subtract(config.localOffset); 
                    
                    // Hinge Transform의 position에 로컬 위치를 설정합니다.
                    const finalLocalPos = initialWorldPos.subtract(parentWorldPos).subtract(config.localOffset.scale(-1)); 
                    hingeTransform.position.copyFrom(finalLocalPos); 
                    
                } else {
                    // Bottom Face (ID 1)는 Base Transform의 자식
                    face.parent = this.baseTransform; 
                    
                    // Bottom Face를 Base Transform의 로컬 원점 (0,0,0)에 오도록 이동
                    face.position.copyFrom(initialWorldPos.scale(-1)); 
                    nodeMap.set(idNum, face);
                }
            }
            
            this.updateFoldProgress(0); // 초기 상태는 펼침 (t=0)
            this.centerCamera();
        }

        // 헬퍼: 재질 설정
        applyMaterial(mesh, color, isHidden) {
            const mat = new BABYLON.StandardMaterial("mat_" + mesh.name, this.scene);
            mat.emissiveColor = color; 
            mat.disableLighting = true;
            mat.backFaceCulling = false;
            if (isHidden) {
                mat.alpha = 0;
                mesh.isPickable = false;
            }
            mesh.material = mat;
        }
        
        /**
         * 접기 진행도(0~1)에 따라 큐브를 실시간으로 접거나 펼칩니다.
         */
        updateFoldProgress(t) {
            for (const id in this.faceConfig) {
                const idNum = parseInt(id);
                const config = this.faceConfig[id];
                const hinge = this.transforms[config.key];
                
                if (idNum === 1 || !hinge) continue;

                const targetAngle = config.angle * t;
                hinge.rotationQuaternion = BABYLON.Quaternion.RotationAxis(config.axis, targetAngle);
            }
        }
        
        /**
         * 씬 내의 모든 메쉬와 노드를 제거합니다.
         */
        disposeAll() {
            if (this.baseTransform) {
                this.baseTransform.dispose(false, true); 
            }
            this.faces = {};
            this.transforms = {};
            this.baseTransform = null;
        }

        // ============================================================
        // 외부 노출 함수 (main.js와의 인터페이스)
        // ============================================================
        
        /**
         * Babylon.js 환경을 설정하고 카메라를 OrbitCamera로 교체합니다.
         */
        initEnvironment() {
            
            const activeCamera = this.scene.activeCamera;
            if (activeCamera && activeCamera.dispose) {
                 activeCamera.dispose();
            }
            
            this.scene.clearColor = new BABYLON.Color4(0.9, 0.9, 0.9, 1);
            
            // 조명 설정
            const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
            light.intensity = 0.7; 
            const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(1, -1, -1), this.scene);
            dirLight.intensity = 0.5;
            
            // ⭐ ArcRotateCamera (OrbitControls) 생성 및 설정
            this.camera = new BABYLON.ArcRotateCamera(
                "arcCamera", 
                // ⭐ Alpha (수평): 90도 조정하여 X축을 화면 정면으로 가져옵니다.
                Math.PI / 2, 
                // ⭐ Beta (수직): 큐브를 위에서 내려다보는 각도로 명확히 조정
                Math.PI / 6, // 30도로 설정하여 큐브가 찌그러지지 않고 위에서 내려다보이도록 조정
                8, // 반경 (radius)
                BABYLON.Vector3.Zero(), // 타겟 (0,0,0) 
                this.scene
            );
            
            // 캔버스 제어 연결
            const canvasElement = this.scene.getEngine().getRenderingCanvas();
            this.camera.attachControl(canvasElement, true);
            
            this.camera.wheelPrecision = 50; 
            this.camera.lowerRadiusLimit = 2; 

            this.scene.activeCamera = this.camera;
        }
        
        centerCamera() {
            if (this.camera && this.camera.setTarget) {
                 this.camera.setTarget(BABYLON.Vector3.Zero());
            }
        }

        /**
         * 전개도를 로드하고 3D 메쉬를 생성합니다.
         */
        loadNet(net, startFoldValue = 0) {
            if (!net || !net.faces) return;
            
            this.createCubeFaces(net.faces);
            this.updateFoldProgress(startFoldValue);
            this.centerCamera();
        }

        /**
         * foldAnimate: 현재는 슬라이더 제어를 위해 t=1로 즉시 이동
         */
        foldAnimate(duration = 2) {
            this.updateFoldProgress(1);
            return Promise.resolve();
        }
        
        // main.js의 validator 연동을 위한 함수들
        unfoldImmediate() { this.updateFoldProgress(0); }
        foldImmediate() { this.updateFoldProgress(1); }
        reset() { this.updateFoldProgress(0); }
        foldTo(t) { this.updateFoldProgress(t); } 
        getFaceGroups = () => this.faces; 
        showSolvedView(duration) {
            this.updateFoldProgress(1);
            return Promise.resolve();
        }
    }

    // ============================================================
    // INIT/RESIZE (외부 인터페이스)
    // ============================================================
    FoldEngine.init = function (canvasElement, babylonEngine, babylonScene) {
        engine = babylonEngine;
        scene = babylonScene;
        
        cubeEngine = new CubeFoldEngine(scene, 1.4); 
        cubeEngine.initEnvironment(); 
    };
    
    // 외부 함수 호출을 내부 인스턴스로 연결합니다.
    FoldEngine.loadNet = (net) => cubeEngine.loadNet(net, 0);
    FoldEngine.unfoldImmediate = () => cubeEngine.unfoldImmediate();
    FoldEngine.unfold = () => cubeEngine.unfoldImmediate(); 
    FoldEngine.reset = () => cubeEngine.reset();
    FoldEngine.foldImmediate = () => cubeEngine.foldImmediate();
    
    FoldEngine.foldTo = (t) => cubeEngine.foldTo(t);
    
    FoldEngine.foldAnimate = (duration = 2) => cubeEngine.foldAnimate(duration);
    FoldEngine.showSolvedView = (duration) => cubeEngine.showSolvedView(duration);
    
    FoldEngine.getFaceGroups = () => cubeEngine.getFaceGroups();

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
