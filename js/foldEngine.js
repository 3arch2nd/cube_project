/**
 * foldEngine.js – 정육면체(6면, 1×1) 전개도 3D 접기 엔진
 *
 * - UI의 net.faces: { id, u, v, w, h } 사용 (w=h=1)
 * - 전개도(2D) → 접기(3D) 애니메이션
 * - 각 면 색 다르게, 내부 선 진하게
 * - Overlap.js / Validator.js에서 3D 정보 읽을 수 있도록 getFaceGroups 제공
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene = null;
    let camera = null;
    let renderer = null;

    let facesSorted = [];
    let adjacency = [];
    let parentOf = [];
    let netCenter = { x: 0, y: 0 };

    let nodes = [];

    const EPS = 1e-6;

    // 3D 면 색 팔레트 (더 진하게)
    const FACE_COLORS = [
        0xff8a80, // 빨강 계열
        0xffd54f, // 노랑 계열
        0x81c784, // 초록 계열
        0x64b5f6, // 파랑 계열
        0xba68c8, // 보라 계열
        0xf06292  // 분홍 계열
    ];

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
        FoldEngine.scene = scene;

        camera = new THREE.PerspectiveCamera(
            40,
            canvas.width / canvas.height,
            0.1,
            100
        );
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);
        FoldEngine.camera = camera;

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const light = new THREE.DirectionalLight(0xffffff, 1.1);
        light.position.set(5, 8, 6);
        scene.add(light);

        console.log("[FoldEngine.init] done");
    };

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
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );

        g.add(mesh);
        g.add(line);

        g.userData.isCubeFace = true;

        return g;
    }

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

    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(face) {
            return [
                { a: [face.u, face.v], b: [face.u + face.w, face.v] },
                { a: [face.u + face.w, face.v], b: [face.u + face.w, face.v + face.h] },
                { a: [face.u + face.w, face.v + face.h], b: [face.u, face.v + face.h] },
                { a: [face.u, face.v + face.h], b: [face.u, face.v] }
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

    function layoutFlat2DIntoNodes() {
        if (!facesSorted.length || !nodes.length) return;

        const N = facesSorted.length;

        const rootFace = facesSorted[0];
        const rootCenterU = rootFace.u + rootFace.w / 2;
        const rootCenterV = rootFace.v + rootFace.h / 2;

        const rootX = rootCenterU - netCenter.x;
        const rootY = -(rootCenterV - netCenter.y);

        const worldPos = new Array(N);

        worldPos[0] = new THREE.Vector3(rootX, rootY, 0);
        nodes[0].position.copy(worldPos[0]);
        nodes[0].quaternion.identity();
        nodes[0].rotation.set(0, 0, 0);

        const Q = [0];
        while (Q.length) {
            const p = Q.shift();
            const parentFace = facesSorted[p];
            const pCenterU = parentFace.u + parentFace.w / 2;
            const pCenterV = parentFace.v + parentFace.h / 2;

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const face = facesSorted[i];
                    const cCenterU = face.u + face.w / 2;
                    const cCenterV = face.v + face.h / 2;

                    const dxNet = cCenterU - pCenterU;
                    const dyNet = cCenterV - pCenterV;

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

    let hingeInfo = [];

    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = new Array(N).fill(null);

        hingeInfo[0] = null;

        const corners = [
            new THREE.Vector3(-0.5, 0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(-0.5, -0.5, 0)
        ];

        for (let i = 1; i < N; i++) {
            const parent = parentOf[i];
            if (parent === null || parent === -1) {
                hingeInfo[i] = null;
                continue;
            }

            const parentFace = facesSorted[parent];
            const childFace = facesSorted[i];

            const pCenterU = parentFace.u + parentFace.w / 2;
            const pCenterV = parentFace.v + parentFace.h / 2;
            const cCenterU = childFace.u + childFace.w / 2;
            const cCenterV = childFace.v + childFace.h / 2;

            const dxNet = cCenterU - pCenterU;
            const dyNet = cCenterV - pCenterV;
            const childCenter_local = new THREE.Vector3(dxNet, -dyNet, 0);

            const rel = adjacency[parent].find(r => r.to === i);
            if (!rel) {
                console.warn("[FoldEngine.buildHingeInfo] no adjacency for parent", parent, "child", i);
                hingeInfo[i] = null;
                continue;
            }

            const edgeId = rel.edgeA;
            let A = null, B = null;
            switch (edgeId) {
                case 0: A = corners[0]; B = corners[1]; break;
                case 1: A = corners[1]; B = corners[2]; break;
                case 2: A = corners[2]; B = corners[3]; break;
                case 3: A = corners[3]; B = corners[0]; break;
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

    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N || !nodes.length) return;

        const Q_world = new Array(N);
        const P_world = new Array(N);

        const rootFace = facesSorted[0];
        const rootCenterU = rootFace.u + rootFace.w / 2;
        const rootCenterV = rootFace.v + rootFace.h / 2;
        const rootX = rootCenterU - netCenter.x;
        const rootY = -(rootCenterV - netCenter.y);

        Q_world[0] = new THREE.Quaternion();
        P_world[0] = new THREE.Vector3(rootX, rootY, 0);

        const queue = [0];
        while (queue.length) {
            const p = queue.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    if (!info) continue;

                    const parentQ = Q_world[p];
                    const parentP = P_world[p];

                    const q_local = new THREE.Quaternion().setFromAxisAngle(
                        info.axis_local,
                        angle
                    );

                    const r0 = info.childCenter_local.clone().sub(info.A_local);
                    r0.applyQuaternion(q_local);
                    const c_local_folded = info.A_local.clone().add(r0);

                    const childQ = parentQ.clone().multiply(q_local);

                    const c_world = c_local_folded.clone().applyQuaternion(parentQ).add(parentP);

                    Q_world[i] = childQ;
                    P_world[i] = c_world;

                    queue.push(i);
                }
            }
        }

        for (let i = 0; i < N; i++) {
            nodes[i].position.copy(P_world[i]);
            nodes[i].quaternion.copy(Q_world[i]);
        }

        scene.updateMatrixWorld(true);
    }

    FoldEngine.unfoldImmediate = function () {
        console.log("[FoldEngine.unfoldImmediate]");
        layoutFlat2DIntoNodes();
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    };

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

        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);
        console.log("[FoldEngine.loadNet] facesSorted:", facesSorted);

        computeNetCenter();
        buildAdjacency();
        buildTree();
        buildHingeInfo();

        clearOldFacesFromScene();

        const N = facesSorted.length;
        nodes = [];
        for (let i = 0; i < N; i++) {
            const g = createUnitFace();
            g.userData.faceIndex = i;
            g.userData.faceId = facesSorted[i].id;

            // 면 색 지정
            const colorIdx = facesSorted[i].id % FACE_COLORS.length;
            const color = FACE_COLORS[colorIdx];
            const mesh = g.children.find(ch => ch.isMesh);
            if (mesh) {
                mesh.material.color.setHex(color);
                mesh.material.transparent = false;
                mesh.material.opacity = 1.0;
            }

            nodes.push(g);
            scene.add(g);
        }

        layoutFlat2DIntoNodes();

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }

        return Promise.resolve();
    };

    FoldEngine.foldAnimate = function (sec = 1.5) {
        console.log("[FoldEngine.foldAnimate] start, sec=", sec);

        if (!renderer || !scene || !camera) {
            console.warn("[FoldEngine.foldAnimate] renderer/scene/camera not ready");
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);

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
                const theta = prog * (Math.PI / 3);
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

    // Overlap / Validator용: 현재 face 그룹 반환
    FoldEngine.getFaceGroups = function () {
        return nodes ? nodes.slice() : [];
    };

})();
