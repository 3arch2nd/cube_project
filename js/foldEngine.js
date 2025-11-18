/**
 * foldEngine.js – DEBUG VERSION for Cube Folding
 * ----------------------------------------------
 * - 정육면체 전개도 전용 (각 face는 1×1)
 * - UI의 (u,v)를 그대로 사용 (단위 격자)
 * - parent-child 트리 + 회전축 계산을 콘솔에 자세히 로깅
 * - 매 loadNet 마다 이전 face Group 완전 제거
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;

    let facesSorted = [];   // id 순으로 정렬된 faces
    let nodes = [];         // 각 face를 나타내는 THREE.Group
    let adjacency = [];     // index-based adjacency 정보
    let parentOf = [];      // BFS로 만든 parent index
    let netCenter = { x: 0, y: 0 };  // 디버그용 (중심)

    const EPS = 1e-6;

    // ============================================================
    // INIT
    // ============================================================
    FoldEngine.init = function (canvas) {
        console.log("[FoldEngine.init] start");

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

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        console.log("[FoldEngine.init] done");
    };

    // ============================================================
    // UNIT FACE
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

        // 디버그용 플래그
        g.userData.isCubeFace = true;

        return g;
    }

    // ============================================================
    // NET CENTER (디버그용 – 현재는 접기에는 안 쓰지만 로그용)
    // ============================================================
    function computeNetCenter() {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            minU = Math.min(minU, f.u);
            minV = Math.min(minV, f.v);
            maxU = Math.max(maxU, f.u + 1);
            maxV = Math.max(maxV, f.v + 1);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;

        console.log("[FoldEngine] netCenter:", netCenter);
    }

    // ============================================================
    // ADJACENCY (index-based)
    // ============================================================
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(face) {
            return [
                { a:[face.u, face.v],     b:[face.u+1, face.v]     }, // top
                { a:[face.u+1, face.v],   b:[face.u+1, face.v+1]   }, // right
                { a:[face.u+1, face.v+1], b:[face.u, face.v+1]     }, // bottom
                { a:[face.u, face.v+1],   b:[face.u, face.v]       }  // left
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
    // BUILD BFS TREE
    // ============================================================
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);

        parentOf[0] = -1; // 첫 face를 root로 사용
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

        const toRemove = [];
        scene.traverse(obj => {
            if (obj.userData && obj.userData.isCubeFace) {
                toRemove.push(obj);
            }
        });

        toRemove.forEach(obj => {
            if (obj.parent) obj.parent.remove(obj);
        });

        console.log("[FoldEngine] cleared old faces:", toRemove.length);
    }

    // ============================================================
    // 2D 전개도 레이아웃 (root는 중심 쪽으로 옮기고, 나머지는 parent 기준 상대 위치)
    // ============================================================
    function layoutFlat2D() {
        if (!facesSorted.length || !nodes.length) return;

        // root를 화면 중앙 근처로 옮기기 위해 center 보정
        const rootFace = facesSorted[0];

        const rootX = rootFace.u - netCenter.x;
        const rootY = -(rootFace.v - netCenter.y);

        for (let i = 0; i < facesSorted.length; i++) {
            const face = facesSorted[i];
            const node = nodes[i];
            const p = parentOf[i];

            node.rotation.set(0, 0, 0);

            if (p === -1) {
                node.position.set(rootX, rootY, 0);
            } else {
                const parentFace = facesSorted[p];
                const du = face.u - parentFace.u;
                const dv = face.v - parentFace.v;
                node.position.set(
                    du,
                    -dv,
                    0
                );
            }
        }

        scene.updateMatrixWorld(true);
    }

    // ============================================================
    // 공개: unfoldImmediate
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        console.log("[FoldEngine.unfoldImmediate]");
        layoutFlat2D();
        renderer.render(scene, camera);
    };

    // ============================================================
    // LOAD NET
    // ============================================================
    FoldEngine.loadNet = function (net) {
        console.log("[FoldEngine.loadNet] net:", net);

        if (!net || !Array.isArray(net.faces)) {
            console.warn("[FoldEngine.loadNet] invalid net");
            return Promise.resolve();
        }

        // 1) faces 정렬
        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);
        console.log("[FoldEngine.loadNet] facesSorted:", facesSorted);

        // 2) 보조 정보 계산
        computeNetCenter();
        buildAdjacency();
        buildTree();

        // 3) 이전 faces 제거
        clearOldFacesFromScene();

        // 4) 새 face 그룹 생성
        nodes = [];
        facesSorted.forEach((face, idx) => {
            const g = createUnitFace();
            g.userData.faceIndex = idx;
            g.userData.faceId = face.id;
            nodes.push(g);
            scene.add(g);
        });

        // 5) flat 레이아웃 적용
        layoutFlat2D();

        renderer.render(scene, camera);

        return Promise.resolve();
    };

    // ============================================================
    // 회전 축(pivot) 계산 – parent local 기준
    // ============================================================
    function getEdgePivotLocal(parentIdx, childIdx) {
        const rel = adjacency[parentIdx].find(r => r.to === childIdx);
        if (!rel) {
            console.warn("[FoldEngine] no relation for", parentIdx, childIdx);
            return null;
        }

        const edgeId = rel.edgeA;

        // unit square(1x1) plane이 (0,0)을 중심으로 있다고 가정:
        // y 위가 +, x 오른쪽 + (Three.js PlaneGeometry 기본)
        const corners = [
            new THREE.Vector3(-0.5,  0.5, 0), // top-left
            new THREE.Vector3( 0.5,  0.5, 0), // top-right
            new THREE.Vector3( 0.5, -0.5, 0), // bottom-right
            new THREE.Vector3(-0.5, -0.5, 0)  // bottom-left
        ];

        let A, B;
        switch (edgeId) {
            case 0: A = corners[0]; B = corners[1]; break; // top
            case 1: A = corners[1]; B = corners[2]; break; // right
            case 2: A = corners[2]; B = corners[3]; break; // bottom
            case 3: A = corners[3]; B = corners[0]; break; // left
            default:
                console.warn("[FoldEngine] invalid edgeId:", edgeId);
                return null;
        }

        const axis = new THREE.Vector3().subVectors(B, A).normalize();

        console.log("[FoldEngine] pivot(parentIdx=" + parentIdx + ", childIdx=" + childIdx +
            ") edgeId=", edgeId, " A=", A, " axis=", axis);

        return { A, axis };
    }

    // ============================================================
    // 한 자식 face 회전
    // ============================================================
    function rotateChildLocal(parentIdx, childIdx, angle) {
        const parentNode = nodes[parentIdx];
        const childNode  = nodes[childIdx];

        if (!parentNode || !childNode) {
            console.warn("[FoldEngine.rotateChildLocal] missing nodes", parentIdx, childIdx);
            return;
        }

        const pivot = getEdgePivotLocal(parentIdx, childIdx);
        if (!pivot) return;

        const { A, axis } = pivot;

        childNode.position.sub(A);
        childNode.rotateOnAxis(axis, angle);
        childNode.position.add(A);
    }

    // ============================================================
    // foldAnimate – 디버그용 애니메이션
    // ============================================================
    FoldEngine.foldAnimate = function (sec = 1.0) {
        console.log("[FoldEngine.foldAnimate] start, sec=", sec);

        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);

                // 먼저 전개도 상태로 리셋
                layoutFlat2D();

                // parent 관계에 따라 차례로 회전
                for (let i = 0; i < facesSorted.length; i++) {
                    const p = parentOf[i];
                    if (p === -1) continue;
                    rotateChildLocal(p, i, angle);
                }

                scene.updateMatrixWorld(true);
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
    // showSolvedView – 카메라만 회전 (접힌 상태 그대로)
    // ============================================================
    FoldEngine.showSolvedView = function (sec = 1.5) {
        console.log("[FoldEngine.showSolvedView] start, sec=", sec);

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

})();
