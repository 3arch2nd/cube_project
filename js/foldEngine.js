// foldEngine.js
// 큐브 전개도 및 접기 애니메이션 핵심 로직 (Babylon.js 기반) - 힌지 회전 구현

(function () {
    "use strict";

    // 전역 FoldEngine 객체를 생성하고 CubeFoldEngine 인스턴스에 접근할 수 있도록 포인팅합니다.
    const FoldEngine = {};
    window.FoldEngine = FoldEngine;
    
    let engine = null;
    let scene = null;
    let cubeEngine = null;

    /**
     * CubeFoldEngine 클래스
     * 큐브의 면을 생성하고, 각 면을 회전축(TransformNode)에 연결하여
     * 접기/펼치기 애니메이션을 구현하는 엔진
     */
    class CubeFoldEngine {
        constructor(scene, size = 1.4) {
            this.scene = scene;
            this.size = size;
            this.faces = {}; // 큐브 면 메쉬 저장
            this.transforms = {}; // 각 면의 회전축 TransformNode 저장
            this.faceConfig = this.getFaceConfig(size); // 각 면의 초기 위치, 회전축 및 회전 방향 정의
            this.baseTransform = null; // 전체 큐브를 담는 최상위 노드
            this.camera = null;
        }

        /**
         * 큐브 접기 시나리오에 따른 각 면의 회전축, 각도, 부모 관계를 정의합니다.
         */
        getFaceConfig(size) {
            const halfSize = size / 2;
            // Config: [초기 위치], [Hinge Pos (Parent 기준)], [Rotation Axis (Vector3)], [Angle (Radians)]
            return {
                // 1. Bottom (Base) - 회전 안 함
                'bottom': { 
                    id: 1, pos: new BABYLON.Vector3(0, 0, 0), hinge: null, axis: null, angle: 0 
                },
                
                // 2. Front - Z축으로 회전 (위로 접힘)
                'front': { 
                    id: 2, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(0, -halfSize, 0), // Bottom 면과의 경계
                    axis: BABYLON.Vector3.Right(), // X축
                    angle: -Math.PI / 2, // -90도
                    parent: 'bottom'
                },

                // 3. Back - Z축으로 회전 (위로 접힘)
                'back': { 
                    id: 3, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(0, -halfSize, 0), // Bottom 면과의 경계
                    axis: BABYLON.Vector3.Left(), // -X축
                    angle: Math.PI / 2, // +90도
                    parent: 'bottom'
                },

                // 4. Right - X축으로 회전 (안쪽으로 접힘)
                'right': { 
                    id: 4, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(-halfSize, -halfSize, 0), // Left 면 기준 Hinge (u,v) = (1,1) -> (1,0)
                    axis: BABYLON.Vector3.Backward(), // -Z축
                    angle: -Math.PI / 2, // -90도
                    parent: 'bottom'
                },

                // 5. Left - X축으로 회전 (안쪽으로 접힘)
                'left': { 
                    id: 5, pos: new BABYLON.Vector3(0, halfSize, 0), 
                    hingePos: new BABYLON.Vector3(halfSize, -halfSize, 0), 
                    axis: BABYLON.Vector3.Forward(), // +Z축
                    angle: Math.PI / 2, // +90도
                    parent: 'bottom'
                },

                // 6. Top (뚜껑) - Front 면을 접은 후 Front의 상단 경계(y=size)에서 회전
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
            this.disposeAll(); // 기존 메쉬와 노드 정리

            const faceColorMap = new Map(facesData.map(f => [f.id, BABYLON.Color3.FromHexString(f.color || "#cccccc")]));

            // 전체 큐브를 회전시킬 최상위 노드 (OrbitControls 타겟)
            this.baseTransform = new BABYLON.TransformNode("cubeBase", this.scene);
            this.baseTransform.position = BABYLON.Vector3.Zero();

            // 1. Bottom 면 생성 (고정)
            const bottomData = facesData.find(f => f.id === this.faceConfig.bottom.id);
            if (!bottomData) return;

            const bottomFace = BABYLON.MeshBuilder.CreatePlane("bottom", { size: this.size }, this.scene);
            bottomFace.rotation.x = Math.PI / 2; // XZ 평면에 놓이도록 회전 (Babylon 기본 평면은 XY)
            bottomFace.position.copy(this.faceConfig.bottom.pos);
            
            this.applyMaterial(bottomFace, faceColorMap.get(bottomData.id), bottomData._hidden);
            bottomFace.parent = this.baseTransform;
            this.faces['bottom'] = bottomFace;
            
            // 2. Hinge TransformNode 및 Face Mesh 생성
            for (const key in this.faceConfig) {
                if (key === 'bottom') continue;

                const config = this.faceConfig[key];
                const faceData = facesData.find(f => f.id === config.id);
                if (!faceData) continue; // 데이터에 없는 면은 생성하지 않음

                // 1) Hinge TransformNode (회전축) 생성
                const hingeTransform = new BABYLON.TransformNode(`hinge_${key}`, this.scene);
                hingeTransform.position.copy(config.hingePos); // Hinge 위치 설정
                
                // 2) 부모 설정 (계층 구조)
                let parentNode;
                if (config.parent === 'bottom') {
                    parentNode = bottomFace;
                } else {
                    // 'top'의 경우 'front'의 Hinge Transform이 부모가 됩니다.
                    parentNode = this.transforms[config.parent]; 
                }
                hingeTransform.parent = parentNode;
                this.transforms[key] = hingeTransform;

                // 3) Face Mesh 생성
                const face = BABYLON.MeshBuilder.CreatePlane(key, { size: this.size }, this.scene);
                face.rotation.x = Math.PI / 2; // XZ 평면에 놓이도록 회전
                
                // HingeTransform의 좌표계(Local)를 기준으로 Face의 위치 설정
                // Face의 중심이 힌지로부터 Z축으로 halfSize만큼 떨어져 있도록
                face.position = new BABYLON.Vector3(0, 0, this.size / 2); 

                this.applyMaterial(face, faceColorMap.get(faceData.id), faceData._hidden);
                face.parent = hingeTransform; 
                this.faces[key] = face;
            }

            // 초기 접기 진행도 0으로 설정 (펼친 상태)
            this.updateFoldProgress(0);

            // 카메라 타겟 설정 (접힌 큐브의 중심)
            this.centerCamera();
            
            return this.baseTransform;
        }
        
        // 헬퍼: 재질 설정
        applyMaterial(mesh, color, isHidden) {
            const mat = new BABYLON.StandardMaterial("mat_" + mesh.name, this.scene);
            mat.emissiveColor = color; // 자체 발광 색상
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
         * @param {number} t 접기 진행도 (0: 완전히 펼침, 1: 완전히 접힘)
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
                this.baseTransform.dispose(false, true); // 자식까지 모두 제거
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
        initEnvironment(camera) {
            this.camera = camera;
            this.scene.clearColor = new BABYLON.Color4(0.9, 0.9, 0.9, 1);
            
            // 조명 설정
            const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
            light.intensity = 0.7; 
            const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(1, -1, -1), this.scene);
            dirLight.intensity = 0.5;
            
            // 카메라 설정을 OrbitControls에 최적화 (요청 ②번)
            // 기존 FreeCamera를 ArcRotateCamera로 교체하거나 설정 변경
            if (camera && camera.name === "camera") {
                camera.dispose();
                this.camera = new BABYLON.ArcRotateCamera(
                    "arcCamera", 
                    Math.PI / 4, // 알파 (수평)
                    Math.PI / 2.5, // 베타 (수직)
                    8, // 반경 (radius)
                    BABYLON.Vector3.Zero(), // 타겟 (0,0,0) (요청 ②번)
                    this.scene
                );
                this.camera.attachControl(this.scene.getEngine().get<ctrl62>
        centerCamera() {
            if (this.camera && this.camera.setTarget) {
                 this.camera.setTarget(BABYLON.Vector3.Zero());
            }
        }

        /**
         * 전개도를 로드하고 3D 메쉬를 생성합니다.
         * @param {object} net 전개도 데이터
         * @param {number} startFoldValue 초기 접기 진행도 (0~1)
         */
        loadNet(net, startFoldValue = 0) {
            if (!net || !net.faces) return;
            
            // 전개도 정보를 기반으로 3D 메쉬와 TransformNode 계층 구조를 만듭니다.
            this.createCubeFaces(net.faces);
            
            // 초기 접기 상태를 설정합니다.
            this.updateFoldProgress(startFoldValue);

            // OrbitControls가 큐브를 타겟하도록 합니다.
            this.centerCamera();
        }

        /**
         * 접기 애니메이션 (요청 ①번)
         * @param {number} duration 애니메이션 시간 (초)
         */
        foldAnimate(duration = 2) {
            return new Promise(resolve => {
                const animationDuration = duration * 1000;
                
                // 애니메이션 그룹 생성
                const animGroup = new BABYLON.AnimationGroup("foldAnim");
                
                for (const key in this.transforms) {
                    const hinge = this.transforms[key];
                    const config = this.faceConfig[key];

                    if (!hinge || !config.axis || config.angle === 0) continue;

                    // 애니메이션 키프레임 정의: 0ms(t=0)에서 90% 접힌 상태(t=0.9), 100% 접힌 상태(t=1)
                    const keys = [
                        { frame: 0, value: 0 },
                        { frame: 100, value: config.angle }
                    ];

                    // Quaternion Animation
                    const rotationAnim = new BABYLON.Animation(
                        `${key}Rot`, 
                        "rotationQuaternion", 
                        60, // FPS
                        BABYLON.Animation.ANIMATIONTYPE_QUATERNION, 
                        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
                    );
                    
                    rotationAnim.setKeys(keys.map(k => ({
                        frame: k.frame,
                        value: BABYLON.Quaternion.RotationAxis(config.axis, k.value)
                    })));

                    hinge.animations = [];
                    hinge.animations.push(rotationAnim);
                    animGroup.addTargetedAnimation(
                        this.scene.beginAnimation(hinge, 0, 100, false), 
                        hinge
                    );
                }
                
                animGroup.speedRatio = 100 / (duration * 60); // FPS 기준 시간 맞춤
                animGroup.onAnimationEndObservable.add(() => {
                    resolve();
                });

                // 애니메이션 시작 (이전 애니메이션을 멈추고 시작)
                this.scene.stopAllAnimations();
                animGroup.play(false);
            });
        }
        
        // main.js의 validator 연동을 위한 함수들 (힌지 회전 엔진으로 대체)
        unfoldImmediate() { this.updateFoldProgress(0); }
        foldImmediate() { this.updateFoldProgress(1); }
        reset() { this.updateFoldProgress(0); }
        foldTo(t) { this.updateFoldProgress(t); } // 슬라이더에서 직접 사용
        getFaceGroups = () => this.faces; // Validator.js가 메쉬를 찾을 수 있도록 제공

        // showSolvedView는 여기서는 foldImmediate와 동일하게 처리합니다.
        showSolvedView(duration) {
            // 자동 접기 후 큐브를 회전할 수 있도록 t=1로 즉시 이동시킵니다.
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
        
        // CubeFoldEngine 인스턴스 생성 및 환경 설정
        cubeEngine = new CubeFoldEngine(scene, 1.4); // UI.js의 셀 크기와 맞춤
        cubeEngine.initEnvironment(babylonScene.activeCamera);
    };
    
    // 외부 함수 호출을 내부 인스턴스로 연결합니다.
    FoldEngine.loadNet = (net) => cubeEngine.loadNet(net, 0);
    FoldEngine.unfoldImmediate = () => cubeEngine.unfoldImmediate();
    FoldEngine.unfold = () => cubeEngine.unfoldImmediate(); // 애니메이션 대신 즉시 펼침
    FoldEngine.reset = () => cubeEngine.reset();
    FoldEngine.foldImmediate = () => cubeEngine.foldImmediate();
    
    // 슬라이더 연동 핵심
    FoldEngine.foldTo = (t) => cubeEngine.foldTo(t);
    
    // 접기 애니메이션 (사용되지 않으나, main.js에서 호출하므로 스텁을 대체)
    FoldEngine.foldAnimate = (duration = 2) => {
        // 자동 애니메이션 대신 슬라이더를 0에서 1로 이동시키는 로직으로 대체 가능
        // main.js에서 슬라이더를 직접 제어하므로, 여기서는 t=1로 즉시 이동만 반영
        cubeEngine.updateFoldProgress(1);
        return Promise.resolve();
    }
    FoldEngine.showSolvedView = (duration) => cubeEngine.showSolvedView(duration);
    
    // Validator 연동
    FoldEngine.getFaceGroups = () => cubeEngine.getFaceGroups();

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
