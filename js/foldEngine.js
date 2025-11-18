/**
 * foldEngine.js – ⭐ 최종 안정화 버전 (모서리 인덱스 순환 오류 수정) ⭐
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // BABYLON 기본 객체 (유지)
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
    const Y_OFFSET_STEP = 0.0001; // 깊이 충돌 방지를 위한 미세 Y축 오프셋 (유지)

    // ------------------------------------------------------------
    // 색상 (선명) (유지)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d, 0xffd43b, 0x51cf66, 0x339af0, 0x845ef7, 0xf06595
    ];

    // Babylon.js 재질 생성 함수 (유지)
    function createFaceMaterial(scene, colorHex) {
        const mat = new BABYLON.StandardMaterial("faceMat" + colorHex, scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString("#" + colorHex.toString(16).padStart(6, '0'));
        mat.alpha = 0.78;
        mat.backFaceCulling = false;
        mat.disableLighting = false;
        return mat;
    }


    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter (유지)
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ------------------------------------------------------------
    // 공통 렌더 루프 (유지)
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
    // INIT (Babylon.js 환경 생성 및 탑 뷰 카메라 설정) (유지)
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
        scene.clearColor = new BABYLON.Color4(1, 1, 1, 1);

        camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, 0, 8, BABYLON.Vector3.Zero(), scene);
        camera.setTarget(BABYLON.Vector3.Zero());

        camera.attachControl(canvas, true);

        camera.inertia = 0.8;
        camera.angularSensibilityX = 3000;
        camera.angularSensibilityY = 3000;
        camera.minZ = 0.01;
        camera.maxZ = 1000;

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
    // 3D 단위 면 생성 (유지)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        
        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));
        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g;
        
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
            const isSame1 = (
                Math.abs(e1.a[0] - e2.b[0]) < EPS &&
                Math.abs(e1.a[1] - e2.b[1]) < EPS &&
                Math.abs(e1.b[0] - e2.a[0]) < EPS &&
                Math.abs(e1.b[1] - e2.a[1]) < EPS
            );
            const isSame2 = (
                Math.abs(e1.a[0] - e2.a[0]) < EPS &&
                Math.abs(e1.a[1] - e2.a[1]) < EPS &&
                Math.abs(e1.b[0] - e2.b[0]) < EPS &&
                Math.abs(e1.b[1] - e2.b[1]) < EPS
            );
            return isSame1 || isSame2;
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
    // 기존 3D 면 제거 (유지)
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        nodes.forEach(g => {
            if (g) g.dispose(false, true);
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치 (깊이 분리 오프셋 적용)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const worldPos = [];
        const worldRot = [];
        
        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];
            
            const cCx = f.u + f.w / 2;
            const cCy = f.v + f.h / 2;

            const rootX = cCx - netCenter.x;
            const rootZ = -(cCy - netCenter.y);
            
            const yOffset = i * Y_OFFSET_STEP;

            worldPos[i] = new BABYLON.Vector3(rootX, yOffset, rootZ); 
            worldRot[i] = new BABYLON.Quaternion();

            nodes[i].position.copyFrom(worldPos[i]);
            nodes[i].rotationQuaternion = worldRot[i];
        }
    }


    // --------------------------------------------------------------------
    // hinge 정보 구성 (⭐ 모서리 인덱스 순서 수정)
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        // 3D XZ 로컬 좌표 (Top View에서 2D와 같은 모양이 나오도록 배치)
        // 2D 데이터의 CCW 순서 (0, 1, 2, 3)에 맞추기 위해 좌표 순서를 조정
        const corners = [
            // ⭐ 수정: 2D 데이터의 시계 반대 방향 순서와 일치시키기 위해 Y축(3D Z축)을 반대로 정의
            new BABYLON.Vector3(-0.5, 0, 0.5),   // A: Left Bottom (2D index 3의 끝점)
            new BABYLON.Vector3(-0.5, 0, -0.5),  // B: Left Top (2D index 3의 시작점 = index 0의 시작점)
            new BABYLON.Vector3(0.5, 0, -0.5),   // C: Right Top
            new BABYLON.Vector3(0.5, 0, 0.5)     // D: Right Bottom
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edgeId = rel.edgeA;
            let A, B;

            switch (edgeId) {
                // 2D 인덱스 0번 모서리: (u, v) -> (u+w, v) (Top)
                case 0: A = corners[1]; B = corners[2]; break; // B(Left Top) -> C(Right Top)
                // 2D 인덱스 1번 모서리: (u+w, v) -> (u+w, v+h) (Right)
                case 1: A = corners[2]; B = corners[3]; break; // C(Right Top) -> D(Right Bottom)
                // 2D 인덱스 2번 모서리: (u+w, v+h) -> (u, v+h) (Bottom)
                case 2: A = corners[3]; B = corners[0]; break; // D(Right Bottom) -> A(Left Bottom)
                // 2D 인덱스 3번 모서리: (u, v+h) -> (u, v) (Left)
                case 3: A = corners[0]; B = corners[1]; break; // A(Left Bottom) -> B(Left Top)
                default: continue;
            }

            const f = facesSorted[i];
            const pf = facesSorted[p];

            const dx = (f.u + f.w / 2) - (pf.u + pf.w / 2);
            const dz = -((f.v + f.h / 2) - (pf.v + pf.h / 2)); 
            
            const dy = 0; 

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                axis_local: B.subtract(A).normalize(),
                childCenter_local: new BABYLON.Vector3(dx, dy, dz)
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) (Y 오프셋 고려)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = []; 
        const Pw = []; 
        
        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        const rootZ = -((rootFace.v + rootFace.h / 2) - netCenter.y);
        
        Pw[0] = new BABYLON.Vector3(rootX, 0 * Y_OFFSET_STEP, rootZ); 
        Qw[0] = new BABYLON.Quaternion();

        const Q = [0]; 

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    
                    if (!info || !info.axis_local) { 
                         Q.push(i);
                         continue; 
                    }

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    const qLocal = BABYLON.Quaternion.RotationAxis(
                        info.axis_local,
                        angle
                    );

                    let r0 = info.childCenter_local.clone().subtract(info.A_local);

                    r0 = BABYLON.Vector3.TransformCoordinates(r0, qLocal.toRotationMatrix()); 

                    const cLocal = info.A_local.clone().add(r0);

                    let cWorld = cLocal.clone().rotateByQuaternionToRef(parentQ, new BABYLON.Vector3());
                    cWorld = cWorld.add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.multiply(qLocal);

                    Q.push(i);
                }
            }
        }

        for (let i = 0; i < N; i++) {
            nodes[i].position = Pw[i].add(new BABYLON.Vector3(0, i * Y_OFFSET_STEP, 0));
            nodes[i].rotationQuaternion = Qw[i];
        }
    }

// PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용 (유지)
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        if (controls) {
            controls.target = BABYLON.Vector3.Zero();
        }
    };


    // --------------------------------------------------------------------
    // PUBLIC: loadNet (타겟 계산 재검토)
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

        // 2) 이전 면들 제거
        clearOldFacesFromScene();

        // 3) 새 면들 생성
        nodes = [];
        facesSorted.forEach(face => {
            const g = createUnitFace(face.id);
            nodes.push(g);
        });

        // 4) 평면 상태로 배치
        layoutFlat2D();

        // 5) 카메라/컨트롤 타겟 초기화 (탑 뷰 시점 및 타겟 설정)
        camera.radius = 8;
        camera.alpha = -Math.PI / 2; 
        camera.beta = 0;             
        
        const rootFace = facesSorted[0];
        const targetX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        const targetZ = -((rootFace.v + rootFace.h / 2) - netCenter.y);
        const targetPosition = new BABYLON.Vector3(targetX, 0, targetZ); 


        if (controls) {
            controls.target = targetPosition; 
            controls.attachControl(engine.getRenderingCanvas(), true); 
        }

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 접기 애니메이션 (유지)
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 2.0) {
        return new Promise(resolve => {

            if (controls) {
                controls.detachControl(engine.getRenderingCanvas(), true);
            }

            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2); 

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
    // PUBLIC: showSolvedView – 즉시 복귀 및 Controls 해제 (유지)
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function (sec = 0.0) {
        return new Promise(resolve => {

            layoutFlat2D(); 
            
            camera.radius = 8;
            camera.alpha = -Math.PI / 2;
            camera.beta = 0;

            const rootFace = facesSorted[0];
            const targetX = (rootFace.u + rootFace.w / 2) - netCenter.x;
            const targetZ = -((rootFace.v + rootFace.h / 2) - netCenter.y);
            const targetPosition = new BABYLON.Vector3(targetX, 0, targetZ);

            if (controls) {
                controls.attachControl(engine.getRenderingCanvas(), true);
                controls.target = targetPosition;
            }

            resolve(); 

        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용 – 즉시 특정 각도로 접기) (유지)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
    };


})();
