/**
 * foldEngine.js – Cube 전개도 전용(6면, 1×1) 버전
 * ----------------------------------------------
 * - UI의 net.faces: { id, u, v, w, h } 를 사용 (정육면체는 항상 w=1, h=1)
 * - 전개도(2D) → 접기(3D) 애니메이션
 * - main.js에서:
 *    1) FoldEngine.init(threeCanvas)
 *    2) FoldEngine.loadNet(net6faces)
 *    3) await FoldEngine.foldAnimate(1.0)
 *    4) await FoldEngine.showSolvedView(1.5)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // THREE.js 기본 객체
    let scene = null;
    let camera = null;
    let renderer = null;

    // 현재 net 관련 상태
    let facesSorted = [];   // id 기준 정렬된 face 배열 (length = 5 또는 6)
    let adjacency = [];     // index 기반 adjacency (facesSorted의 index 사용)
    let parentOf = [];      // BFS 트리: parentOf[i] = 부모 index, root는 -1
    let netCenter = { x: 0, y: 0 };   // 2D 전개도의 중심 (u,v 좌표계 기준)

    // 3D 노드(각 면)
    let nodes = [];         // nodes[i] = THREE.Group(plane + edge 라인)

    const EPS = 1e-6;

    // ============================================================
    // INIT
    // ============================================================
    FoldEngine.init = function (canvas) {
        console.log("[FoldEngine.init] start");

        if (!canvas) {
            console.warn("[FoldEngine.init] canvas is null/undefined");
            return;
        }

        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true
            });
        }
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(
            40,
            canvas.width / canvas.height,
            0.1,
            100
        );
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);

        // 기본 조명
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        console.log("[FoldEngine.init] done");
    };

    // ============================================================
    // UNIT FACE (1×1 정사각형)
    // ============================================================
    function createUnitFace() {
        const g = new THREE.Group();

        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geom, mat);

        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x333333 })
        );

        g.add(mesh);
        g.add(line);

        // 제거용 플래그
        g.userData.isCubeFace = true;

        return g;
    }

    // ============================================================
    // NET CENTER (u,v 좌표계에서의 중심)
    // ============================================================
    function computeNetCenter() {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            const u0 = f.u;
            const v0 = f.v;
            const u1 = f.u + f.w;
            const v1 = f.v + f.h;
            minU = Math.min(minU, u0);
            minV = Math.min(minV, v0);
            maxU = Math.max(maxU, u1);
            maxV = Math.max(maxV, v1);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;

        console.log("[FoldEngine] netCenter:", netCenter);
    }

    // ============================================================
    // ADJACENCY (index-based)
    //  - facesSorted의 index로 인접 정보를 만든다
    //  - 각 face는 w=h=1 (정육면체) 전제
    // ============================================================
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(face) {
            return [
                // 각 face는 (u,v)~(u+1,v+1) 범위의 정사각형
                { a:[face.u, face.v],     b:[face.u + face.w, face.v]          }, // top
                { a:[face.u + face.w, face.v], b:[face.u + face.w, face.v + face.h] }, // right
                { a:[face.u + face.w, face.v + face.h], b:[face.u, face.v + face.h] }, // bottom
                { a:[face.u, face.v + face.h], b:[face.u, face.v]                }  // left
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

        console.log("[FoldEngine] adjacency:", JSON.stringify(adjacency, null, 2));
    }

    // ============================================================
    // BFS TREE (parentOf)
    //  - root = facesSorted[0] (id가 가장 작은 face)
    // ============================================================
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);

        parentOf[0] = -1;
        const Q = [0];

        while (Q.length) {
            const f = Q.shift();
            adjacency[f].forEach(rel => {
                if (parentOf[rel.to] === null) {
                    parentOf[rel.to] = f;
                    Q.push(rel.to);
                }
            });
        }

        console.log("[FoldEngine] parentOf:", parentOf);
    }

    // ============================================================
    // 이전 face 그룹 제거
    // ============================================================
    function clearOldFacesFromScene() {
        if (!scene) return;

        nodes.forEach(node => {
            if (node && node.parent) {
                node.parent.remove(node);
            }
        });
        nodes = [];

        console.log("[FoldEngine] cleared old faces");
    }

    // ============================================================
    // flat 상태(전개도)에서 각 face의 center를 3D로 배치
    // - y 축은 부호 반전 (캔버스와 Three.js 좌표계 차이)
    // - root는 전개도 중심 주변으로 오도록 보정
    // ============================================================
    function layoutFlat2DIntoNodes() {
        if (!facesSorted.length || !nodes.length) return;

        const N = facesSorted.length;

        // root face의 center (u+0.5, v+0.5)
        const rootFace = facesSorted[0];
        const rootCenterU = rootFace.u + rootFace.w / 2;
        const rootCenterV = rootFace.v + rootFace.h / 2;

        // 전개도 중심과의 차이만큼 root를 3D에서 이동
        const rootX = rootCenterU - netCenter.x;
        const rootY = -(rootCenterV - netCenter.y);

        // 각 face의 world position을 계산하기 위한 임시 배열
        const worldPos = new Array(N);

        // 루트부터
        worldPos[0] = new THREE.Vector3(rootX, rootY, 0);
        nodes[0].position.copy(worldPos[0]);
        nodes[0].quaternion.identity();
        nodes[0].rotation.set(0, 0, 0);

        const Q = [0];
        while (Q.length) {
            const p = Q.shift();
            const parentFace = facesSorted[p];

            // parent의 center (net 좌표계)
            const parentCenterU = parentFace.u + parentFace.w / 2;
            const parentCenterV = parentFace.v + parentFace.h / 2;

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const face = facesSorted[i];

                    const childCenterU = face.u + face.w / 2;
                    const childCenterV = face.v + face.h / 2;

                    const dxNet = childCenterU - parentCenterU;
                    const dyNet = childCenterV - parentCenterV;

                    const dx = dxNet;
                    const dy = -dyNet;

                    worldPos[i] = new THREE.Vector3(
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
                    );

                    nodes[i].position.copy(worldPos[i]);
                    nodes[i].quaternion.identity();
                    nodes[i].rotation.set(0, 0, 0);

                    Q.push(i);
                }
            }
        }

        scene.updateMatrixWorld(true);
    }

    // ============================================================
    // hinge 정보 사전 계산용 구조
    //   hingeInfo[i] = {
    //     parent: parentIndex,
    //     A_local: Vector3,      // parent local에서의 hinge 기준점
    //     axis_local: Vector3,   // parent local에서의 hinge 축 (단위벡터)
    //     childCenter_local: Vector3  // parent local에서 본 child center(전개도 상태)
    //   }
    // ============================================================
    let hingeInfo = [];

    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = new Array(N).fill(null);

        // 루트는 hinge 없음
        hingeInfo[0] = null;

        // parent-local 좌표계에서 unit square의 모서리
        const corners = [
            new THREE.Vector3(-0.5,  0.5, 0), // top-left
            new THREE.Vector3( 0.5,  0.5, 0), // top-right
            new THREE.Vector3( 0.5, -0.5, 0), // bottom-right
            new THREE.Vector3(-0.5, -0.5, 0)  // bottom-left
        ];

        for (let i = 1; i < N; i++) {
            const parent = parentOf[i];
            if (parent === null || parent === -1) {
                hingeInfo[i] = null;
                continue;
            }

            const parentFace = facesSorted[parent];
            const childFace  = facesSorted[i];

            // parent와 child의 center (net 좌표계)
            const pCenterU = parentFace.u + parentFace.w / 2;
            const pCenterV = parentFace.v + parentFace.h / 2;
            const cCenterU = childFace.u + childFace.w / 2;
            const cCenterV = childFace.v + childFace.h / 2;

            // parent local에서 child center
            const dxNet = cCenterU - pCenterU;
            const dyNet = cCenterV - pCenterV;
            const childCenter_local = new THREE.Vector3(dxNet, -dyNet, 0);

            // parent→child 인접 edge 찾기
            const rel = adjacency[parent].find(r => r.to === i);
            if (!rel) {
                console.warn("[FoldEngine.buildHingeInfo] no adjacency for parent", parent, "child", i);
                hingeInfo[i] = null;
                continue;
            }

            const edgeId = rel.edgeA;
            let A = null, B = null;
            switch (edgeId) {
                case 0: A = corners[0]; B = corners[1]; break; // top
                case 1: A = corners[1]; B = corners[2]; break; // right
                case 2: A = corners[2]; B = corners[3]; break; // bottom
                case 3: A = corners[3]; B = corners[0]; break; // left
                default:
                    console.warn("[FoldEngine.buildHingeInfo] invalid edgeId:", edgeId);
                    hingeInfo[i] = null;
                    continue;
            }

            const axis_local = new THREE.Vector3().subVectors(B, A).normalize();

            hingeInfo[i] = {
                parent,
                A_local: A.clone(),
                axis_local,
                childCenter_local
            };

            console.log("[FoldEngine] hingeInfo for child", i, ":", hingeInfo[i]);
        }
    }

    // ============================================================
    // angle(0~π/2)에 따른 3D 위치/자세 계산
    //  - 전개도(평면)에서 시작해서 각 면을 parent hinge 기준으로 꺾어 올림
    // ============================================================
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N || !nodes.length) return;

        // 루트의 orientation, position부터 계산
        const Q_world = new Array(N);
        const P_world = new Array(N);

        // 루트
        const rootFace = facesSorted[0];
        const rootCenterU = rootFace.u + rootFace.w / 2;
        const rootCenterV = rootFace.v + rootFace.h / 2;
        const rootX = rootCenterU - netCenter.x;
        const rootY = -(rootCenterV - netCenter.y);

        Q_world[0] = new THREE.Quaternion();  // identity
        P_world[0] = new THREE.Vector3(rootX, rootY, 0);

        // BFS 순서로 parent→child
        const queue = [0];
        while (queue.length) {
            const p = queue.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    if (!info) continue;

                    const parentQ = Q_world[p];
                    const parentP = P_world[p];

                    // parent local에서의 회전 쿼터니언
                    const q_local = new THREE.Quaternion().setFromAxisAngle(
                        info.axis_local,
                        angle
                    );

                    // child center (parent local, 접힌 상태)
                    const r0 = info.childCenter_local.clone().sub(info.A_local);
                    r0.applyQuaternion(q_local);
                    const c_local_folded = info.A_local.clone().add(r0);

                    // world orientation
                    const childQ = parentQ.clone().multiply(q_local);

                    // world position: parentP + parentQ * c_local_folded
                    const c_world = c_local_folded.clone().applyQuaternion(parentQ).add(parentP);

                    Q_world[i] = childQ;
                    P_world[i] = c_world;

                    queue.push(i);
                }
            }
        }

        // 계산된 transform을 nodes에 반영
        for (let i = 0; i < N; i++) {
            nodes[i].position.copy(P_world[i]);
            nodes[i].quaternion.copy(Q_world[i]);
        }

        scene.updateMatrixWorld(true);
    }

    // ============================================================
    // 공개: unfoldImmediate – 전개도 평면 상태를 바로 보여주기
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        console.log("[FoldEngine.unfoldImmediate]");
        layoutFlat2DIntoNodes();
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    };

    // ============================================================
    // LOAD NET
    //  - main.js에서 새 net(5 or 6면)을 넣을 때 호출
    // ============================================================
    FoldEngine.loadNet = function (net) {
        console.log("[FoldEngine.loadNet] net:", net);

        if (!net || !Array.isArray(net.faces)) {
            console.warn("[FoldEngine.loadNet] invalid net");
            return Promise.resolve();
        }

        if (!scene || !camera || !renderer) {
            console.warn("[FoldEngine.loadNet] init이 먼저 호출되지 않았습니다.");
            return Promise.resolve();
        }

        // 1) faces 정렬 (id 오름차순)
        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);
        console.log("[FoldEngine.loadNet] facesSorted:", facesSorted);

        // 2) 보조 정보 계산
        computeNetCenter();
        buildAdjacency();
        buildTree();
        buildHingeInfo();

        // 3) 이전 faces 제거
        clearOldFacesFromScene();

        // 4) 새 face 그룹 생성
        const N = facesSorted.length;
        nodes = [];
        for (let i = 0; i < N; i++) {
            const g = createUnitFace();
            g.userData.faceIndex = i;
            g.userData.faceId = facesSorted[i].id;
            nodes.push(g);
            scene.add(g);
        }

        // 5) flat 상태로 배치
        layoutFlat2DIntoNodes();

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }

        return Promise.resolve();
    };

    // ============================================================
    // foldAnimate – 전개도 → 접힘 애니메이션
    //   angle: 0 → π/2까지
    // ============================================================
    FoldEngine.foldAnimate = function (sec = 1.0) {
        console.log("[FoldEngine.foldAnimate] start, sec=", sec);

        if (!renderer || !scene || !camera) {
            console.warn("[FoldEngine.foldAnimate] renderer/scene/camera not ready");
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);  // 90도

                applyFolding(angle);

                renderer.render(scene, camera);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    console.log("[FoldEngine.foldAnimate] end");
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };

    // ============================================================
    // showSolvedView – 접힌 상태를 유지한 채 카메라만 회전
    // ============================================================
    FoldEngine.showSolvedView = function (sec = 1.5) {
        console.log("[FoldEngine.showSolvedView] start, sec=", sec);

        if (!renderer || !scene || !camera) {
            console.warn("[FoldEngine.showSolvedView] renderer/scene/camera not ready");
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const theta = prog * (Math.PI / 3); // 60도 정도 회전
                const radius = 7;

                camera.position.set(
                    radius * Math.sin(theta),
                    3,
                    radius * Math.cos(theta)
                );
                camera.lookAt(0, 0, 0);

                renderer.render(scene, camera);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    console.log("[FoldEngine.showSolvedView] end");
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };

})();
