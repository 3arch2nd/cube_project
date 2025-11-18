/**
 * foldEngine.js – Perfect Cube Folding Engine (Final)
 * 
 * ⭐ 정육면체 전개도 전용
 * 
 * 핵심 기능:
 * 1) 2D 전개도를 6개 faceGroup으로 로드
 * 2) adjacency(u,v 기반)로 parent-child folding tree 구성
 * 3) faceGroup들을 scene에서 parent-child로 재배치 (붙어 있는 종이처럼)
 * 4) 공유 edge를 축으로 자식 face가 parent face에 붙어서 회전
 * 5) foldAnimate(): 0 → 90도 자연스러운 접기 애니메이션
 * 6) showSolvedView(): 완성 후 카메라 회전
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];
    let foldTreeParent = [];
    let adjList = [];

    const EPS = 1e-6;

    // -------------------------
    // Three.js Init
    // -------------------------
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        }
        renderer.setSize(canvas.width, canvas.height);

        if (!scene) {
            scene = new THREE.Scene();
            FoldEngine.scene = scene;
        } else {
            while (scene.children.length > 0) {
                scene.remove(scene.children[0]);
            }
        }

        const aspect = canvas.width / canvas.height;
        camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
        camera.position.set(0, 0, 7);
        camera.lookAt(0, 0, 0);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    };

    // -------------------------
    // Create Face Geometry
    // -------------------------
    function createFaceGeometry() {
        const geom = new THREE.Geometry();

        geom.vertices.push(
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(-0.5, 0.5, 0)
        );

        geom.faces.push(new THREE.Face3(0, 1, 2));
        geom.faces.push(new THREE.Face3(0, 2, 3));
        geom.computeFaceNormals();
        return geom;
    }

    // -------------------------
    // Build adjacency (붙어있는 면 찾기)
    // -------------------------
    function buildAdjacency(net) {
        const faces = net.faces;
        const N = faces.length;

        const adj = [...Array(N)].map(() => []);

        function edgePoints(f) {
            return [
                { a: [f.u, f.v], b: [f.u + 1, f.v] },
                { a: [f.u + 1, f.v], b: [f.u + 1, f.v + 1] },
                { a: [f.u + 1, f.v + 1], b: [f.u, f.v + 1] },
                { a: [f.u, f.v + 1], b: [f.u, f.v] }
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
            const Ei = edgePoints(faces[i]);

            for (let j = i + 1; j < N; j++) {
                const Ej = edgePoints(faces[j]);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            adj[faces[i].id].push({ to: faces[j].id, edgeA: ei, edgeB: ej });
                            adj[faces[j].id].push({ to: faces[i].id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }
        return adj;
    }

    // -------------------------
    // Build Tree (root = face 0)
    // -------------------------
    function buildTree(adj) {
        const parent = Array(6).fill(null);
        const order = [];

        const root = 0;
        parent[root] = -1;

        const Q = [root];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            adj[f].forEach(rel => {
                if (parent[rel.to] === null) {
                    parent[rel.to] = f;
                    Q.push(rel.to);
                }
            });
        }

        return { parent, order };
    }

    // -------------------------
    // Load Net → create faceGroups
    // -------------------------
    FoldEngine.loadNet = function (net) {
        faceGroups = [];
        foldTreeParent = [];
        adjList = buildAdjacency(net);

        // faceGroups 생성 (ID 순서)
        net.faces
            .sort((a, b) => a.id - b.id)
            .forEach(f => {
                const group = new THREE.Group();
                group.faceId = f.id;

                const geom = createFaceGeometry();
                const mesh = new THREE.Mesh(
                    geom,
                    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
                );

                const edges = new THREE.EdgesGeometry(geom);
                const line = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: 0x333333 })
                );

                group.add(mesh);
                group.add(line);

                // 초기 위치 = 전개도 좌표를 3D 평면에 그대로
                group.position.set(f.u, -f.v, 0);
                group.updateMatrix();

                scene.add(group);
                faceGroups.push(group);
            });

        scene.updateMatrixWorld(true);

        const { parent, order } = buildTree(adjList);
        foldTreeParent = parent;

        // parent-child 연결 재구성
        faceGroups.forEach(g => {
            if (parent[g.faceId] !== -1) {
                const p = faceGroups.find(x => x.faceId === parent[g.faceId]);
                p.add(g);
            }
        });

        return Promise.resolve();
    };

    // -------------------------
    // Rotate child face about shared edge
    // -------------------------
    function foldOneFace(parentGroup, childGroup, rel, angleRad) {
        const pFace = parentGroup.faceId;
        const relation = adjList[pFace].find(x => x.to === childGroup.faceId);

        if (!relation) return;

        // 회전축(전개도 edge)의 3D 좌표
        const f = relation.edgeA;
        const parentNet = FoldEngine.currentNet.faces.find(x => x.id === pFace);

        const edge = [
            [parentNet.u, parentNet.v],
            [parentNet.u + 1, parentNet.v],
            [parentNet.u + 1, parentNet.v + 1],
            [parentNet.u, parentNet.v + 1]
        ];

        const A = new THREE.Vector3(edge[f][0], -edge[f][1], 0);
        const B = new THREE.VectorVector3(edge[(f + 1) % 4][0], -edge[(f + 1) % 4][1], 0);

        // world transform
        parentGroup.updateMatrixWorld(true);
        childGroup.updateMatrixWorld(true);

        const Aw = A.clone().applyMatrix4(parentGroup.matrixWorld);
        const Bw = B.clone().applyMatrix4(parentGroup.matrixWorld);

        const axis = Bw.clone().sub(Aw).normalize();

        childGroup.rotateOnWorldAxis(axis, angleRad);
    }

    // -------------------------
    // foldAnimate (0 → 90도)
    // -------------------------
    FoldEngine.foldAnimate = function (durationSec = 1) {
        return new Promise(resolve => {
            const start = performance.now();

            function animate(t) {
                const prog = Math.min(1, (t - start) / (durationSec * 1000));
                const angle = prog * (Math.PI / 2);

                // unfold first
                foldTreeParent.forEach((pId, childId) => {
                    const g = faceGroups.find(x => x.faceId === childId);
                    const parent = pId === -1 ? null : faceGroups.find(x => x.faceId === pId);

                    g.rotation.set(0, 0, 0);
                });

                scene.updateMatrixWorld(true);

                // fold
                foldTreeParent.forEach((pId, childId) => {
                    if (pId === -1) return;

                    const parent = faceGroups.find(x => x.faceId === pId);
                    const child = faceGroups.find(x => x.faceId === childId);

                    foldOneFace(parent, child, null, angle);
                });

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (prog < 1) requestAnimationFrame(animate);
                else resolve();
            }
            requestAnimationFrame(animate);
        });
    };

    // -------------------------
    // showSolvedView: 카메라 천천히 회전
    // -------------------------
    FoldEngine.showSolvedView = function (durationSec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();

            function animate(t) {
                const prog = Math.min(1, (t - start) / (durationSec * 1000));
                const theta = prog * (Math.PI / 4);

                camera.position.set(
                    6 * Math.sin(theta),
                    3,
                    6 * Math.cos(theta)
                );
                camera.lookAt(0, 0, 0);

                renderer.render(scene, camera);

                if (prog < 1) requestAnimationFrame(animate);
                else resolve();
            }
            requestAnimationFrame(animate);
        });
    };

})();
