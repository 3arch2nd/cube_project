/**
 * foldEngine.js – ⭐ BABYLON.js 최종 안정화 및 포팅 완료 버전 ⭐
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // BABYLON 기본 객체
    // ------------------------------------------------------------
    let scene = null;
    let camera = null;
    let engine = null; 

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

    let nodes = []; 

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (선명)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d, 0xffd43b, 0x51cf66, 0x339af0, 0x845ef7, 0xf06595
    ];
    
    // Babylon.js 재질 생성 함수
    function createFaceMaterial(scene, colorHex) {
        const mat = new BABYLON.StandardMaterial("faceMat" + colorHex, scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString("#" + colorHex.toString(16).padStart(6, '0'));
        mat.alpha = 0.78; 
        mat.backFaceCulling = false; // 양면 렌더링
        mat.disableLighting = false; // 조명 영향 받도록 설정
        return mat;
    }


    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ------------------------------------------------------------
    // 공통 렌더 루프 (Babylon.js의 Engine 루프로 대체)
    // ------------------------------------------------------------
    function startBaseLoop() {
        if (animationStarted || !engine || !scene) return;
        animationStarted = true;

        engine.runRenderLoop(function () {
            if (scene) {
                scene.render();
            }
        });
        
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

        if (engine) {
             return; 
        }

        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        
        scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(1, 1, 1, 1); // 3D 배경 흰색

        // ⭐ ArcRotateCamera 사용 (OrbitControls 대체)
        camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 2, 8, BABYLON.Vector3.Zero(), scene);
        camera.setTarget(BABYLON.Vector3.Zero());
        
        camera.attachControl(canvas, true); 
        
        camera.inertia = 0.8; 
        camera.angularSensibilityX = 3000;
        camera.angularSensibilityY = 3000;
        camera.minZ = 0.1; 

        // 조명: HemisphericLight와 DirectionalLight 역할을 수행하도록 HemisphericLight를 추가
        new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
        new BABYLON.HemisphericLight("light2", new BABYLON.Vector3(0, -1, 0), scene);
        
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
    // 3D 단위 면 생성 (Babylon.js 대체 및 방향 수정)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        // ⭐ BABYLON.MeshBuilder.CreatePlane을 사용하여 면 생성
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        
        // ⭐ 재질 생성 및 할당
        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));
        
        // ⭐ BABYLON.TransformNode (THREE.Group 대체)
        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g; 
        
        // ⭐ 수정: Plane이 XY평면에 놓였을 때 Z축을 바라보도록 초기 회전 (이전 THREE.js 환경과 유사하게)
        plane.rotation.x = Math.PI / 2;
        
        plane.setPivotPoint(BABYLON.Vector3.Zero());

        g.id = faceId; 
        g.metadata = { isCubeFace: true }; 
        nodes.push(g);
        
        return g;
    }

// PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산 (유지)
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
        nodes.forEach(g => {
            if (g) g.dispose(false, true); 
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치 (수학 객체 변환 및 Y축 반전 수정)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        // ⭐ 수정: Y축 반전 문제를 해결하기 위해 부호 제거
        const rootY = ((rootFace.v + rootFace.h / 2) - netCenter.y); 

        const worldPos = [];
        const worldRot = [];

        worldPos[0] = new BABYLON.Vector3(rootX, rootY, 0); 
        worldRot[0] = new BABYLON.Quaternion(); 

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
                    // ⭐ 수정: Y축 반전 문제를 해결하기 위해 부호 제거
                    const dy = (cCy - pCy); 

                    worldPos[i] = new BABYLON.Vector3( 
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
                    );
                    worldRot[i] = new BABYLON.Quaternion(); 

                    nodes[i].position.copyFrom(worldPos[i]);
                    nodes[i].rotationQuaternion = worldRot[i];

                    Q.push(i);
                }
            }
        }

    }


    // --------------------------------------------------------------------
    // hinge 정보 구성 (수학 객체 변환)
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new BABYLON.Vector3(-0.5, 0.5, 0), 
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
            // ⭐ 수정: Y축 반전 문제를 해결하기 위해 부호 제거
            const dy = (f.v + f.h / 2) - (pf.v + pf.h / 2); 

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                axis_local: B.subtract(A).normalize(), 
                childCenter_local: new BABYLON.Vector3(dx, dy, 0) 
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) - 수학 객체 포팅 (유지)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = [];
        const Pw = [];

        Pw[0] = new BABYLON.Vector3( 
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            // ⭐ 수정: Y축 반전 문제를 해결하기 위해 부호 제거
            ((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y),
            0
        );
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

                    const qLocal = BABYLON.Quaternion.RotationAxis( 
                        info.axis_local, 
                        angle
                    );
                    
                    let r0 = info.childCenter_local.clone().subtract(info.A_local);
                    // ⭐ 수정: Vector3의 회전은 matrix를 통해 적용
                    r0 = BABYLON.Vector3.TransformCoordinates(r0, BABYLON.Matrix.FromQuaternion(qLocal)); 

                    const cLocal = info.A_local.clone().add(r0);
                    
                    // ⭐ 수정: cWorld 계산도 matrix를 통해 적용
                    const cWorld = BABYLON.Vector3.TransformCoordinates(cLocal, BABYLON.Matrix.Compose(
                        BABYLON.Vector3.One(), parentQ, BABYLON.Vector3.Zero()
                    )).add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.multiply(qLocal); 

                    Q.push(i);
                }
            }
        }

        // 위치/회전 적용
        for (let i = 0; i < N; i++) {
            nodes[i].position = Pw[i]; 
            nodes[i].rotationQuaternion = Qw[i]; 
        }

    }


// PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        // 렌더는 공통 루프에서 자동 수행
        if (controls) {
            controls.target = BABYLON.Vector3.Zero();
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
        if (!scene || !camera || !engine) { 
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
        });

        // 4) (있다면) 이전 빗금 그룹 제거 후 새로 생성 (Three.js 로직 제거)

        // 5) 평면 상태로 배치
        layoutFlat2D();

        // 6) 카메라/컨트롤 타겟 초기화 (문제 로딩 시 항상 초기 상태로 돌아감)
        // ⭐ 수정: 카메라 시점 초기화 (정면 뷰)
        camera.radius = 8;
        camera.alpha = -Math.PI / 2;
        camera.beta = Math.PI / 2;
        
        if (controls) {
            controls.target = BABYLON.Vector3.Zero(); 
        }

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 접기 애니메이션 (Controls 잠금 수정)
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 2.0) {
        return new Promise(resolve => {
            
            // ⭐ API 오류 해결: engine.getRenderingCanvas()로 변경
            if (controls) {
                controls.detachControl(engine.getRenderingCanvas(), true); 
            }

            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2); // 0 → 90도

                applyFolding(angle);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
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
            
            // ⭐ 수정: 카메라 시점 초기화 (정면 뷰)
            camera.radius = 8;
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2;
            
            if (controls) {
                // ⭐ API 오류 해결: engine.getRenderingCanvas()로 변경
                controls.attachControl(engine.getRenderingCanvas(), true);
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
