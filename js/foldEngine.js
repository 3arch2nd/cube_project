// foldEngine.js
// 큐브 전개도 및 접기 애니메이션 핵심 로직 (Babylon.js 기반) - 힌지 회전 구현

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
        }

        /**
         * 큐브 접기 시나리오에 따른 각 면의 회전축, 각도, 부모 관계를 정의합니다.
         */
        getFaceConfig(size) {
            const halfSize = size / 2;
            return {
                // 1. Bottom (Base) - 고정
                'bottom': { 
                    id: 1, pos: new BABYLON.Vector3(0, 0, 0), hinge: null, axis: null, angle: 0 
                },
                
                // 2. Front - X축으로 회전
                'front': { 
                    id: 2, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(0, -halfSize, 0), // Bottom 면과의 경계
                    axis: BABYLON.Vector3.Right(), // +X축
                    angle: -Math.PI / 2, // -90도
                    parent: 'bottom'
                },

                // 3. Back - X축으로 회전
                'back': { 
                    id: 3, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(0, -halfSize, 0), // Bottom 면과의 경계
                    axis: BABYLON.Vector3.Left(), // -X축
                    angle: Math.PI / 2, // +90도
                    parent: 'bottom'
                },

                // 4. Right - Z축으로 회전
                'right': { 
                    id: 4, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(-halfSize, -halfSize, 0), 
                    axis: BABYLON.Vector3.Backward(), // -Z축
                    angle: -Math.PI / 2, // -90도
                    parent: 'bottom'
                },

                // 5. Left - Z축으로 회전
                'left': { 
                    id: 5, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(halfSize, -halfSize, 0), 
                    axis: BABYLON.Vector3.Forward(), // +Z축
                    angle: Math.PI / 2, // +90도
                    parent: 'bottom'
                },

                // 6. Top (뚜껑) - Front Hinge를 기준으로 X축 회전
                'top': { 
                    id: 6, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(0, size, 0), // Front 면의 상단 (Front Transform 기준)
                    axis: BABYLON.Vector3.Right(), // X축
                    angle: -Math.PI / 2, // -90도
                    parent: 'front' // Front의 Hinge Transform에 연결
                },
            };
        }

        /**
         * 큐브 면과 회전축(TransformNode)을 생성하고 계층 구조를 설정합니다.
         */
        createCubeFaces(facesData) {
            this.disposeAll(); 

            const faceColorMap = new Map(facesData.map(f => [f.id, BABYLON.Color3.FromHexString(f.color || "#cccccc")]));

            this.baseTransform = new BABYLON.TransformNode("cubeBase", this.scene);
            this.baseTransform.position = BABYLON.Vector3.Zero();

            // 1. Bottom 면 생성 (고정)
            const bottomData = facesData.find(f => f.id === this.faceConfig.bottom.id);
            if (!bottomData) return;

            const bottomFace = BABYLON.MeshBuilder.CreatePlane("bottom", { size: this.size }, this.scene);
            bottomFace.rotation.x = Math.PI / 2; // XZ 평면에 놓이도록 회전
            bottomFace.position.copy(this.faceConfig.bottom.pos);
            
            this.applyMaterial(bottomFace, faceColorMap.get(bottomData.id), bottomData._hidden);
            bottomFace.parent = this.baseTransform;
            this.faces['bottom'] = bottomFace;
            
            // 2. Hinge TransformNode 및 Face Mesh 생성
            for (const key in this.faceConfig) {
                if (key === 'bottom') continue;

                const config = this.faceConfig[key];
                const faceData = facesData.find(f => f.id === config.id);
                if (!faceData) continue; 

                // 1) Hinge TransformNode (회전축) 생성
                const hingeTransform = new BABYLON.TransformNode(`hinge_${key}`, this.scene);
                hingeTransform.position.copy(config.hingePos); 
                
                // 2) 부모 설정 (계층 구조)
                let parentNode;
                if (config.parent === 'bottom') {
                    parentNode = bottomFace;
                } else {
                    parentNode = this.transforms[config.parent]; 
                }
                hingeTransform.parent = parentNode;
                this.transforms[key] = hingeTransform;

                // 3) Face Mesh 생성
                const face = BABYLON.MeshBuilder.CreatePlane(key, { size: this.size }, this.scene);
                face.rotation.x = Math.PI / 2; // XZ 평면에 놓이도록 회전
                
                // HingeTransform의 좌표계(Local)를 기준으로 Face의 위치 설정
                face.position = new BABYLON.Vector3(0, 0, this.size / 2); 

                this.applyMaterial(face, faceColorMap.get(faceData.id), faceData._hidden);
                face.parent = hingeTransform; 
                this.faces[key] = face;
            }

            this.updateFoldProgress(0);
            this.centerCamera();
            
            return this.baseTransform;
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
         * 접기 진행도(0~1)에 따라 큐브를 실시간으로 접거나 펼칩니다. (요청 ③번)
         */
        updateFoldProgress(t) {
            // 1. Front, Back, Right, Left (1단계 접기)
            for (const key of ['front', 'back', 'right', 'left']) {
                const config = this.faceConfig[key];
                const hinge = this.transforms[key];
                if (!hinge) continue;
                
                const rotationAngle = config.angle * t;
                hinge.rotationQuaternion = BABYLON.Quaternion.RotationAxis(config.axis, rotationAngle);
            }

            // 2. Top (2단계 접기)
            const topConfig = this.faceConfig['top'];
            const topHinge = this.transforms['top'];
            if (topHinge) {
                const topRotationAngle = topConfig.angle * t;
                topHinge.rotationQuaternion = BABYLON.Quaternion.RotationAxis(topConfig.axis, topRotationAngle);
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
         * Babylon.js 환경을 설정하고 카메라를 OrbitCamera로 교체합니다. (오류 수정 완료)
         */
        initEnvironment() {
            
            // 기존 씬의 카메라가 있다면 제거합니다.
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
            
            // ⭐ ArcRotateCamera (OrbitControls) 생성 및 설정 (요청 ②번)
            this.camera = new BABYLON.ArcRotateCamera(
                "arcCamera", 
                Math.PI / 4, // 알파 (수평)
                Math.PI / 2.5, // 베타 (수직)
                8, // 반경 (radius)
                BABYLON.Vector3.Zero(), // 타겟 (0,0,0) (요청 ②번)
                this.scene
            );
            
            // 캔버스 제어 연결 (오류 수정 완료)
            const canvasElement = this.scene.getEngine().getRenderingCanvas();
            this.camera.attachControl(canvasElement, true);
            
            this.camera.wheelPrecision = 50; 
            this.camera.lowerRadiusLimit = 2; 

            // 씬의 활성 카메라를 새로 만든 ArcRotateCamera로 설정합니다.
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
         * 접기 애니메이션 (현재는 즉시 접힘 처리)
         */
        foldAnimate(duration = 2) {
            // main.js에서 슬라이더를 통해 수동 제어하도록 했으므로, 즉시 접힌 상태로 만듭니다.
            this.updateFoldProgress(1);
            return Promise.resolve();
        }
        
        // main.js의 validator 연동을 위한 함수들
        unfoldImmediate() { this.updateFoldProgress(0); }
        foldImmediate() { this.updateFoldProgress(1); }
        reset() { this.updateFoldProgress(0); }
        foldTo(t) { this.updateFoldProgress(t); } // 슬라이더에서 직접 사용
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
        cubeEngine.initEnvironment(); // 수정 완료
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
