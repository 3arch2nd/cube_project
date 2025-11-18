/**
 * foldEngine.js – ⭐ BABYLON.js 최종 포팅 버전 ⭐
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // BABYLON 기본 객체 (THREE 대체)
    // ------------------------------------------------------------
    let scene = null;
    let camera = null;
    let engine = null; // ⭐ Babylon.js는 'renderer' 대신 'engine'을 사용합니다.

    // Controls 변수는 제거하고 camera 객체 자체를 Controls로 사용
    let controls = null; 
    let animationStarted = false;

    // ------------------------------------------------------------
    // 전개도 데이터 (유지)
    // ------------------------------------------------------------
    let facesSorted = [];
    let adjacency = [];
    let parentOf = [];
    let hingeInfo = [];
    let netCenter = { x: 0, y: 0 };

    let nodes = []; // BABYLON.TransformNode (THREE.Group 대체)

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (선명)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d, 0xffd43b, 0x51cf66, 0x339af0, 0x845ef7, 0xf06595
    ];

    // ------------------------------------------------------------
    // CanvasTexture 기반 빗금 패턴 생성 (Babylon.js 대체 로직)
    // ------------------------------------------------------------
    function createFaceMaterial(scene, colorHex) {
        // ⭐ Babylon.js StandardMaterial 사용
        const mat = new BABYLON.StandardMaterial("faceMat" + colorHex, scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString("#" + colorHex.toString(16).padStart(6, '0'));
        mat.alpha = 0.78; // 반투명 설정
        mat.backFaceCulling = false; // 양면 렌더링 (THREE.DoubleSide 대체)
        
        // 빗금 텍스처는 복잡하므로, 현재는 기본 색상만 적용합니다.
        
        return mat;
    }
    // (THREE.js의 createHatchTexture 및 HATCH_TEXTURE는 삭제됨)


    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // FoldEngine.scene = scene; // Babylon.js는 Scene 객체를 전역에 노출하지 않음

    // ------------------------------------------------------------
    // 공통 렌더 루프 (Babylon.js의 Engine 루프로 대체)
    // ------------------------------------------------------------
    function startBaseLoop() {
        if (animationStarted || !engine || !scene) return;
        animationStarted = true;

        // ⭐ Babylon.js의 메인 렌더 루프 사용
        engine.runRenderLoop(function () {
            if (scene) {
                scene.render();
            }
        });
        
        // Resize 이벤트 리스너 추가
        window.addEventListener("resize", function () {
            engine.resize();
        });
    }

    // --------------------------------------------------------------------
    // INIT (Babylon.js 환경 생성)
    // --------------------------------------------------------------------
    FoldEngine.init = function (canvas) {
        if (!canvas) {
            console.warn("[FoldEngine.init] canvas is null");
            return;
        }

        // ⭐ Babylon.js 엔진 생성
        if (engine) {
             // 재초기화 방지 (Three.js init 로직을 Babylon.js에 맞게 단순화)
             return; 
        }

        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        
        // ⭐ 씬 및 카메라 생성
        scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(1, 1, 1, 1); // 3D 배경 흰색

        // ⭐ ArcRotateCamera 사용 (OrbitControls 대체)
        // alpha: 수평, beta: 수직 (위에서 보는 시점), radius: 거리 (8), target: (0, 0, 0)
        camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 8, BABYLON.Vector3.Zero(), scene);
        camera.setTarget(BABYLON.Vector3.Zero());
        
        // ⭐ 마우스/터치 컨트롤 활성화
        camera.attachControl(canvas, true); 
        
        // Damping 설정
        camera.inertia = 0.8; 
        camera.angularSensibilityX = 3000;
        camera.angularSensibilityY = 3000;

        // 조명 추가
        new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(1, 1, 0), scene);
        
        // Controls 객체 대신 카메라 객체를 참조
        controls = camera; 

        startBaseLoop();
    };

    // --------------------------------------------------------------------
    // 색상 유틸 (유지)
    // --------------------------------------------------------------------
    function getFaceColorById(id) {
        return FACE_COLORS[id % FACE_COLORS.length];
    }

    // --------------------------------------------------------------------
    // 3D 단위 면 생성 (Babylon.js 대체)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        // ⭐ BABYLON.MeshBuilder.CreatePlane을 사용하여 면 생성
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1 }, scene);
        
        // ⭐ 재질 생성 및 할당
        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));
        
        // ⭐ BABYLON.TransformNode (THREE.Group 대체)
        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g; 
        
        // 큐브 면의 중심을 피봇으로 설정 (Babylon.js는 월드 피봇을 사용하므로, Mesh를 TransformNode에 붙여 그룹화)
        plane.setPivotPoint(BABYLON.Vector3.Zero());

        g.id = faceId; // Face ID 저장
        g.metadata = { isCubeFace: true }; // Custom data 저장 방식
        nodes.push(g);
        
        return g;
    }

// PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산 (수학 객체 변환)
    // --------------------------------------------------------------------
    function computeNetCenter() {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            minU = Math.min(minU, f.u);
            minV = Math.min(minV, f.v);
            maxU = Math.max(maxU, f.u + f.w);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }


    // --------------------------------------------------------------------
    // adjacency 구성 (유지)
    // --------------------------------------------------------------------
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(f) {
            return [
                { a: [f.u, f.v], b: [f.u + f.w, f.v] },
                { a: [f.u + f.w, f.v], b: [f.u + f.w, f.v + f.h] },
                { a: [f.u + f.w, f.v + f.h], b: [f.u, f.v + f.h] },
                { a: [f.u, f.v + f.h], b: [f.u, f.v] }
            ];
        }

        function sameEdge(e1, e2) {
            return (
                Math.abs(e1.a[0] - e2.b[0]) < EPS &&
                Math.abs(e1.a[1] - e2.b[1]) < EPS &&
                Math.abs(e1.b[0] - e2.a[0]) < EPS &&
                Math.abs(e1.b[1] - e2.a[1]) < EPS
            );
        }

        for (let i = 0; i < N; i++) {
            const Ei = edges(facesSorted[i]);
            for (let j = i + 1; j < N; j++) {
                const Ej = edges(facesSorted[j]);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(Ei[a], Ej[b])) {
                            adjacency[i].push({ to: j, edgeA: a, edgeB: b });
                            adjacency[j].push({ to: i, edgeA: b, edgeB: a });
                        }
                    }
                }
            }
        }
    }


    // --------------------------------------------------------------------
    // BFS 트리 구성 (유지)
    // --------------------------------------------------------------------
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);

        parentOf[0] = -1;
        const Q = [0];

        while (Q.length) {
            const p = Q.shift();

            adjacency[p].forEach(rel => {
                if (parentOf[rel.to] === null) {
                    parentOf[rel.to] = p;
                    Q.push(rel.to);
                }
            });
        }
    }


    // --------------------------------------------------------------------
    // 기존 3D 면 제거 (Babylon.js 대체)
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        // ⭐ Babylon.js: Dispose를 사용하여 Mesh 제거
        nodes.forEach(g => {
            if (g) g.dispose(false, true); 
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치 (수학 객체 변환)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        const rootY = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        // ⭐ THREE.Vector3 -> BABYLON.Vector3
        worldPos[0] = new BABYLON.Vector3(rootX, rootY, 0); 
        // ⭐ THREE.Quaternion -> BABYLON.Quaternion
        worldRot[0] = new BABYLON.Quaternion(); 

        // ⭐ 위치/회전 적용 (Babylon.js 구문)
        nodes[0].position.copyFrom(worldPos[0]);
        nodes[0].rotationQuaternion = worldRot[0];

        // BFS 배치
        const Q = [0];

        while (Q.length) {
            const p = Q.shift();
            const pFace = facesSorted[p];

            const pCx = pFace.u + pFace.w / 2;
            const pCy = pFace.v + pFace.h / 2;

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const f = facesSorted[i];

                    const cCx = f.u + f.w / 2;
                    const cCy = f.v + f.h / 2;

                    const dx = cCx - pCx;
                    const dy = -(cCy - pCy);

                    worldPos[i] = new BABYLON.Vector3( // ⭐ BABYLON.Vector3
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
                    );
                    worldRot[i] = new BABYLON.Quaternion(); // ⭐ BABYLON.Quaternion

                    // ⭐ 위치/회전 적용 (Babylon.js 구문)
                    nodes[i].position.copyFrom(worldPos[i]);
                    nodes[i].rotationQuaternion = worldRot[i];

                    Q.push(i);
                }
            }
        }

        // scene.updateMatrixWorld(true); // Babylon.js는 자동
    }


    // --------------------------------------------------------------------
    // hinge 정보 구성 (수학 객체 변환)
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new BABYLON.Vector3(-0.5, 0.5, 0), // ⭐ BABYLON.Vector3
            new BABYLON.Vector3(0.5, 0.5, 0),
            new BABYLON.Vector3(0.5, -0.5, 0),
            new BABYLON.Vector3(-0.5, -0.5, 0)
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edge = rel.edgeA;
            let A, B;

            switch (edge) {
                case 0: A = corners[0]; B = corners[1]; break;
                case 1: A = corners[1]; B = corners[2]; break;
                case 2: A = corners[2]; B = corners[3]; break;
                case 3: A = corners[3]; B = corners[0]; break;
            }

            const f = facesSorted[i];
            const pf = facesSorted[p];

            const dx = (f.u + f.w / 2) - (pf.u + pf.w / 2);
            const dy = -((f.v + f.h / 2) - (pf.v + pf.h / 2));

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                // ⭐ BABYLON.Vector3
                axis_local: B.subtract(A).normalize(), 
                childCenter_local: new BABYLON.Vector3(dx, dy, 0) 
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) - 수학 객체 포팅
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = [];
        const Pw = [];

        // ⭐ BABYLON.Vector3
        Pw[0] = new BABYLON.Vector3( 
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y),
            0
        );
        // ⭐ BABYLON.Quaternion
        Qw[0] = new BABYLON.Quaternion(); 

        const Q = [0];

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    if (!info) continue;

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    // ⭐ BABYLON.Quaternion.RotationAxis 사용
                    const qLocal = BABYLON.Quaternion.RotationAxis( 
                        info.axis_local, 
                        angle
                    );
                    
                    // ⭐ BABYLON.Vector3 연산
                    let r0 = info.childCenter_local.clone().subtract(info.A_local);
                    r0 = r0.rotateByQuaternionToRef(qLocal, r0); // BABYLON 회전 함수 사용

                    const cLocal = info.A_local.clone().add(r0);
                    
                    // ⭐ BABYLON.Vector3/Quaternion 연산
                    const cWorld = cLocal.clone().rotateByQuaternionToRef(parentQ, new BABYLON.Vector3()).add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.multiply(qLocal); 

                    Q.push(i);
                }
            }
        }

        // 위치/회전 적용
        for (let i = 0; i < N; i++) {
            nodes[i].position = Pw[i]; // ⭐ Babylon.js는 .copy() 대신 직접 할당
            nodes[i].rotationQuaternion = Qw[i]; // ⭐ rotationQuaternion 사용
        }

        // scene.updateMatrixWorld(true); // Babylon.js는 자동으로 처리
    }


// PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        // 렌더는 공통 루프에서 자동 수행
        if (controls) {
            // controls.target.set(0, 0, 0); // ArcRotateCamera는 target이 이미 고정
            controls.update(); // Babylon.js에서 controls.update()는 불필요하지만 안전을 위해 유지
        }
    };


    // --------------------------------------------------------------------
    // PUBLIC: loadNet
    // --------------------------------------------------------------------
    FoldEngine.loadNet = function (net) {
        if (!net || !Array.isArray(net.faces)) {
            console.warn("[FoldEngine.loadNet] invalid net");
            return Promise.resolve();
        }
        if (!scene || !camera || !engine) { // ⭐ renderer -> engine
            console.warn("[FoldEngine.loadNet] init 먼저 필요");
            return Promise.resolve();
        }

        // 1) 전개도 데이터 준비
        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        buildAdjacency();
        buildTree();
        buildHingeInfo();

        // 2) 이전 면들 제거 (Babylon.js의 dispose 사용)
        clearOldFacesFromScene();

        // 3) 새 면들 생성
        nodes = [];
        facesSorted.forEach(face => {
            const g = createUnitFace(face.id);
            nodes.push(g);
            // scene.add(g); // Babylon.js는 Mesh/TransformNode를 생성 시 Scene에 자동 추가
        });


        // 4) (있다면) 이전 빗금 그룹 제거 후 새로 생성 (Babylon.js에서는 복잡하므로 로직 삭제)
        
        // 5) 평면 상태로 배치
        layoutFlat2D();

        // 6) 카메라/컨트롤 타겟 초기화 (문제 로딩 시 항상 초기 상태로 돌아감)
        // ⭐ Babylon.js: 카메라의 위치(radius)와 각도(alpha, beta)를 초기화
        camera.radius = 8;
        camera.alpha = Math.PI / 2;
        camera.beta = Math.PI / 2;
        
        if (controls) {
            controls.target = BABYLON.Vector3.Zero(); // ⭐ 타겟 강제 설정
            controls.update(); // Babylon.js에서 update는 불필요하지만 안전을 위해 유지
        }

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 접기 애니메이션 (Controls 잠금 추가)
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 2.0) {
        return new Promise(resolve => {
            
            // ⭐ 핵심: 애니메이션 시작 시 Controls 비활성화 (Babylon.js 구문)
            if (controls) {
                controls.detachControl(engine.get );
            }

            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2); // 0 → 90도

                applyFolding(angle);
                // 렌더링은 공통 루프에서 자동 진행 (Babylon.js Engine)

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    // ⭐ 애니메이션 완료 후 Controls 활성화 로직은 showSolvedView로 위임
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };


// --------------------------------------------------------------------
    // PUBLIC: showSolvedView – 즉시 복귀 및 Controls 해제
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function (sec = 0.0) { 
        return new Promise(resolve => {
            
            // ⭐ Babylon.js: 카메라 위치 및 각도 초기화 (즉시 복귀)
            camera.radius = 8;
            camera.alpha = Math.PI / 2;
            camera.beta = Math.PI / 2;
            
            if (controls) {
                // ⭐ Controls 재활성화
                controls.attachControl(engine.get , true);
                controls.target = BABYLON.Vector3.Zero(); 
            }
            
            resolve(); // 즉시 완료

        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용 – 즉시 특정 각도로 접기)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
        // 렌더링은 공통 루프에서 자동 처리
    };


})();
