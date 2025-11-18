/**
 * foldEngine.js – 최신 안정 버전 + 반투명 + OrbitControls + 빗금(///)
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // THREE 기본 객체
    // ------------------------------------------------------------
    let scene = null;
    let camera = null;
    let renderer = null;

    // OrbitControls
    let controls = null;
    let animationStarted = false;

    // ------------------------------------------------------------
    // 전개도 데이터
    // ------------------------------------------------------------
    let facesSorted = [];
    let adjacency = [];
    let parentOf = [];
    let hingeInfo = [];
    let netCenter = { x: 0, y: 0 };

    let nodes = []; // THREE.Group (각 면)

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (선명)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d,
        0xffd43b,
        0x51cf66,
        0x339af0,
        0x845ef7,
        0xf06595
    ];

    // ------------------------------------------------------------
    // CanvasTexture 기반 빗금 패턴 생성
    // ------------------------------------------------------------
    function createHatchTexture() {
        const size = 128;
        const cvs = document.createElement("canvas");
        cvs.width = size;
        cvs.height = size;

        const c = cvs.getContext("2d");
        c.strokeStyle = "rgba(0,0,0,0.95)";
        c.lineWidth = 8;

        c.beginPath();
        c.moveTo(-20, 20);
        c.lineTo(150, 190);
        c.stroke();

        c.beginPath();
        c.moveTo(-20, -40);
        c.lineTo(150, 120);
        c.stroke();

        const tex = new THREE.CanvasTexture(cvs);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);

        return tex;
    }

    const HATCH_TEXTURE = createHatchTexture();

    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    FoldEngine.scene = scene; // validator 용

    // ------------------------------------------------------------
    // 공통 렌더 루프
    // ------------------------------------------------------------
    function startBaseLoop() {
        if (animationStarted || !renderer || !scene || !camera) return;
        animationStarted = true;

        function loop() {
            requestAnimationFrame(loop);

            // controls가 유효하면 무조건 update를 호출합니다.
            if (controls) {
                controls.update(); 
            }

            renderer.render(scene, camera);
        }
        requestAnimationFrame(loop);
    }

    // --------------------------------------------------------------------
    // INIT
    // --------------------------------------------------------------------
    FoldEngine.init = function (canvas) {
        if (!canvas) {
            console.warn("[FoldEngine.init] canvas is null");
            return;
        }

        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true
            });
        }

        renderer.setSize(canvas.width, canvas.height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0xffffff, 1); // ★★★ 3D 배경 흰색

        scene = new THREE.Scene();
        FoldEngine.scene = scene;

        camera = new THREE.PerspectiveCamera(
            40,
            canvas.width / canvas.height,
            0.1,
            200
        );
        camera.position.set(0, 0, 8); // 카메라 거리를 10에서 8로 조정
        camera.lookAt(0, 0, 0);

        const amb = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(amb);

        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(4, 5, 6);
        scene.add(dir);

        // --------------------------------------------------------
        // OrbitControls 활성화
        // --------------------------------------------------------
        if (window.THREE && THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.enablePan = false;
            controls.target.set(0, 0, 0);
            controls.update();

            // 캔버스가 상호작용을 잡도록 강제합니다. (tabIndex, 포커스)
            renderer.domElement.tabIndex = 1; 
            renderer.domElement.style.outline = 'none'; 
            renderer.domElement.addEventListener('pointerdown', () => {
                renderer.domElement.focus();
            });

        } else {
            controls = null;
            console.error("[FoldEngine] OrbitControls 로드 또는 초기화 실패.");
        }

        startBaseLoop();
    };

    // --------------------------------------------------------------------
    // 색상 유틸
    // --------------------------------------------------------------------
    function getFaceColorById(id) {
        return FACE_COLORS[id % FACE_COLORS.length];
    }

    // --------------------------------------------------------------------
    // 겹침 빗금 재질 만들기
    // --------------------------------------------------------------------
    function createHatchMaterial() {
        return new THREE.MeshBasicMaterial({
            map: HATCH_TEXTURE,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }

    // --------------------------------------------------------------------
    // 3D 단위 면 생성 (반투명 + 테두리 + 빗금 레이어 포함)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        const g = new THREE.Group();

        // 본체 면
        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshLambertMaterial({
            color: getFaceColorById(faceId),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.78
        });
        const mesh = new THREE.Mesh(geom, mat);

        // 빗금 오버레이 (기본은 숨김)
        const hatchMesh = new THREE.Mesh(geom, createHatchMaterial());
        hatchMesh.visible = false; // ★ 기본 숨김
        mesh.userData.hatch = hatchMesh;

        // 테두리
        const edges = new THREE.EdgesGeometry(geom);
        const edgeLine = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
                color: 0x000000,
                linewidth: 2
            })
        );

        g.add(mesh);
        g.add(hatchMesh);
        g.add(edgeLine);

        g.userData.faceId = faceId;
        g.userData.isCubeFace = true;

        return g;
    }

// PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산
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
    // adjacency 구성
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
    // BFS 트리 구성 (parentOf)
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
    // 기존 3D 면 제거
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        nodes.forEach(g => {
            if (g && g.parent) g.parent.remove(g);
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치 (unfoldImmediate)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        const rootY = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        worldPos[0] = new THREE.Vector3(rootX, rootY, 0);
        worldRot[0] = new THREE.Quaternion();

        nodes[0].position.copy(worldPos[0]);
        nodes[0].quaternion.copy(worldRot[0]);

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

                    worldPos[i] = new THREE.Vector3(
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
                    );
                    worldRot[i] = new THREE.Quaternion();

                    nodes[i].position.copy(worldPos[i]);
                    nodes[i].quaternion.copy(worldRot[i]);

                    Q.push(i);
                }
            }
        }

        scene.updateMatrixWorld(true);
    }


    // --------------------------------------------------------------------
    // hinge 정보 구성
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new THREE.Vector3(-0.5, 0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(-0.5, -0.5, 0)
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
                axis_local: new THREE.Vector3().subVectors(B, A).normalize(),
                childCenter_local: new THREE.Vector3(dx, dy, 0)
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = [];
        const Pw = [];

        Pw[0] = new THREE.Vector3(
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y),
            0
        );
        Qw[0] = new THREE.Quaternion();

        const Q = [0];

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    if (!info) continue;

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    const qLocal = new THREE.Quaternion()
                        .setFromAxisAngle(info.axis_local, angle);

                    const r0 = info.childCenter_local.clone().sub(info.A_local);
                    r0.applyQuaternion(qLocal);

                    const cLocal = info.A_local.clone().add(r0);
                    const cWorld =
                        cLocal.clone().applyQuaternion(parentQ).add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.clone().multiply(qLocal);

                    Q.push(i);
                }
            }
        }

        // 위치/회전 적용
        for (let i = 0; i < N; i++) {
            nodes[i].position.copy(Pw[i]);
            nodes[i].quaternion.copy(Qw[i]);
        }

        scene.updateMatrixWorld(true);
    }


// PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        // 렌더는 공통 루프에서 자동 수행
        if (controls) {
            controls.target.set(0, 0, 0);
            controls.update();
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
        if (!scene || !camera || !renderer) {
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
            scene.add(g);
        });

        // 4) (있다면) 이전 빗금 그룹 제거 후 새로 생성
        if (typeof createHatchMeshForFace === "function") {
            if (window.__cubeHatchGroup && window.__cubeHatchGroup.parent) {
                window.__cubeHatchGroup.parent.remove(window.__cubeHatchGroup);
            }
            const hatchGroup = new THREE.Group();
            nodes.forEach(faceGroup => {
                const h = createHatchMeshForFace(faceGroup);
                if (h) hatchGroup.add(h);
            });
            scene.add(hatchGroup);
            window.__cubeHatchGroup = hatchGroup;
        }

        // 5) 평면 상태로 배치
        layoutFlat2D();

        // 6) 카메라/컨트롤 타겟 초기화 (문제 로딩 시 항상 초기 상태로 돌아감)
        camera.position.set(0, 0, 8); // ⭐ 카메라 거리를 0, 0, 8로 재설정 (위에서 보는 시점)
        camera.lookAt(0, 0, 0);
        
        if (controls) {
            // ⭐ OrbitControls의 내부 회전 상태를 완전히 초기화 (다음 문제 시작 시 필수)
            controls.reset(); 
            controls.target.set(0, 0, 0);
            controls.update();
        }

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 접기 애니메이션
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 2.0) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2); // 0 → 90도

                applyFolding(angle);
                // 렌더링은 공통 루프에서 자동 진행

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
    // PUBLIC: showSolvedView – 자동 회전 기능 제거, OrbitControls 즉시 활성화 보장
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function () {
        return new Promise(resolve => {
            // OrbitControls 복구 및 타겟 재설정
            if (controls) {
                controls.enabled = true; // 터치/마우스 회전 가능하도록 설정
                controls.target.set(0, 0, 0);
                controls.update(); // 1차 업데이트: Target 반영
                
                // ⭐ 큐브가 사라지는 현상 방지 및 Target을 확실히 고정
                controls.update(); // 2차 업데이트: 변경된 Target을 렌더링에 완전히 적용
            }
            resolve();
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
