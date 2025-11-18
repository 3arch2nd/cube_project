/**
 * foldEngine.js – 정육면체 전개도 접기 엔진 (최적화 완성본)
 *
 * 특징:
 *  - 전개도(u, v) 절대좌표 기반
 *  - 모든 faceGroup 공통 좌표계 공유
 *  - 모서리(edge) 실제 3D 위치 기반으로 fold pivot 계산
 *  - fold 방향(+/-) 자동판정 → 큐브를 감싸듯 자연스럽게 접힘
 *  - three.js R0.12~R0.14 호환(Matrix4.getInverse 사용)
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];
    let parentOf = [];
    FoldEngine.currentNet = null;

    const WHITE = 0xffffff;
    const OUTLINE = 0x333333;
    const EPS = 1e-6;

    let netCenterU = 0;
    let netCenterV = 0;

    // ==========================================================
    //  INITIALIZE
    // ==========================================================
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas, antialias: true
            });
        }
        renderer.setSize(canvas.width, canvas.height);

        if (!scene) {
            scene = new THREE.Scene();
            FoldEngine.scene = scene;
        } else {
            while (scene.children.length) scene.remove(scene.children[0]);
        }

        if (!camera) {
            camera = new THREE.PerspectiveCamera(
                40,
                canvas.width / canvas.height,
                0.1,
                100
            );
        }
        camera.position.set(0, 0, 8);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);
        scene.add(camera);
    };

    // ==========================================================
    //  HELPER: face 중심
    // ==========================================================
    function getFaceCenter(face) {
        return {
            x: face.u + face.w / 2,
            y: face.v + face.h / 2
        };
    }

    // ==========================================================
    //  HELPER: fold 방향 부호 (+/- 90°)
    // ==========================================================
    function getFoldSign(fp, fc, edgeA) {
        const cp = getFaceCenter(fp);
        const cc = getFaceCenter(fc);

        const dx = cc.x - cp.x;
        const dy = cc.y - cp.y;

        switch (edgeA) {
            case 0: return (dy < 0 ? -1 : 1); // 위쪽 edge
            case 2: return (dy > 0 ?  1 : -1); // 아래쪽 edge
            case 1: return (dx > 0 ?  1 : -1); // 오른쪽 edge
            case 3: return (dx < 0 ? -1 : 1);  // 왼쪽 edge
            default: return 1;
        }
    }

    // ==========================================================
    //  HELPER: 절대좌표 기반 로컬 면 4꼭짓점 생성
    //  cornersLocal = [TL, TR, BR, BL]
    // ==========================================================
    function computeCornersLocal(face) {
        const u = face.u;
        const v = face.v;
        const w = face.w;
        const h = face.h;

        const x0 = u - netCenterU;
        const x1 = u + w - netCenterU;
        const yTop = -(v - netCenterV);
        const yBottom = -((v + h) - netCenterV);

        return [
            new THREE.Vector3(x0, yTop, 0),
            new THREE.Vector3(x1, yTop, 0),
            new THREE.Vector3(x1, yBottom, 0),
            new THREE.VectorVector3(x0, yBottom, 0)
        ];
    }

    // ==========================================================
    //  HELPER: cornersLocal → geometry 생성
    // ==========================================================
    function createFaceGeometry(corners) {
        const geom = new THREE.Geometry();
        corners.forEach(c => geom.vertices.push(c.clone()));

        geom.faces.push(new THREE.Face3(0, 1, 2));
        geom.faces.push(new THREE.Face3(0, 2, 3));

        geom.computeFaceNormals();
        return geom;
    }

    // ==========================================================
    //  LOAD NET → 3D 전개도 배치
    // ==========================================================
    FoldEngine.loadNet = function (net) {
        FoldEngine.currentNet = net;
        faceGroups = [];

        // cleanup
        scene.children
            .filter(o => o.type === "Group")
            .forEach(o => scene.remove(o));

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);

        // 전개도 중심 계산
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        for (const f of faces) {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }
        netCenterU = (minU + maxU) / 2;
        netCenterV = (minV + maxV) / 2;

        // 그룹 생성
        faces.forEach(face => {
            const group = new THREE.Group();
            group.faceId = face.id;

            const cornersLocal = computeCornersLocal(face);
            const geom = createFaceGeometry(cornersLocal);

            const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({
                color: WHITE,
                side: THREE.DoubleSide
            }));

            const edges = new THREE.EdgesGeometry(geom);
            const outline = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: OUTLINE })
            );

            group.add(mesh);
            group.add(outline);

            group.userData.cornersLocal = cornersLocal.map(c => c.clone());
            group.userData.netInfo = { ...face };

            group.position.set(0, 0, 0);
            group.rotation.set(0, 0, 0);
            group.updateMatrixWorld(true);

            group.userData.initialPosition = group.position.clone();
            group.userData.initialQuaternion = group.quaternion.clone();

            faceGroups.push(group);
            scene.add(group);
        });

        faceGroups.sort((a, b) => a.faceId - b.faceId);

        return new Promise(resolve => {
            scene.updateMatrixWorld(true);
            renderer.render(scene, camera);
            requestAnimationFrame(resolve);
        });
    };

    // ==========================================================
    //  UNFOLD
    // ==========================================================
    FoldEngine.unfoldImmediate = function () {
        faceGroups.forEach(g => {
            g.position.copy(g.userData.initialPosition);
            g.quaternion.copy(g.userData.initialQuaternion);
            g.updateMatrixWorld(true);
        });
        scene.updateMatrixWorld(true);
        renderer.render(scene, camera);
    };

    // ==========================================================
    //  HELPER: adjacency
    // ==========================================================
    function getEdges(f) {
        return [
            { a:[f.u, f.v],            b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v],      b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h],b:[f.u, f.v + f.h]        }, // bottom
            { a:[f.u, f.v + f.h],      b:[f.u, f.v]              }  // left
        ];
    }

    function buildAdjacency(net) {
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = faces.reduce((m, f) => Math.max(m, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);

        for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
                const fi = faces[i], fj = faces[j];
                const Ei = getEdges(fi), Ej = getEdges(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (
                            Math.abs(Ei[ei].a[0] - Ej[ej].b[0]) < EPS &&
                            Math.abs(Ei[ei].a[1] - Ej[ej].b[1]) < EPS &&
                            Math.abs(Ei[ei].b[0] - Ej[ej].a[0]) < EPS &&
                            Math.abs(Ei[ei].b[1] - Ej[ej].a[1]) < EPS
                        ) {
                            adj[fi.id].push({ to: fj.id, edgeA: ei, edgeB: ej });
                            adj[fj.id].push({ to: fi.id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }
        return adj;
    }

    // ==========================================================
    //  BFS TREE
    // ==========================================================
    function buildTree(adj) {
        const ids = faceGroups.map(g => g.faceId);
        const root = ids[0];
        const parent = Array(Math.max(...ids) + 1).fill(null);
        parent[root] = -1;

        const order = [];
        const Q = [root];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            adj[f].forEach(n => {
                if (parent[n.to] === null) {
                    parent[n.to] = f;
                    Q.push(n.to);
                }
            });
        }
        return { parent, order };
    }

    // ==========================================================
    //  HELPER: 회전축 계산
    // ==========================================================
    function getAxisAndPoint(parentGroup, relation) {
        const c = parentGroup.userData.cornersLocal;
        const i1 = relation.edgeA;
        const i2 = (relation.edgeA + 1) % 4;

        const p1 = c[i1].clone().applyMatrix4(parentGroup.matrixWorld);
        const p2 = c[i2].clone().applyMatrix4(parentGroup.matrixWorld);

        const axis = new THREE.Vector3().subVectors(p2, p1).normalize();
        return { axis, point: p1 };
    }

    // ==========================================================
    //  FOLD (ANIMATE)
    // ==========================================================
    FoldEngine.foldAnimate = function (duration = 1) {

        const net = FoldEngine.currentNet;
        if (!net) return Promise.resolve();

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const adj = buildAdjacency(net);
        const { parent, order } = buildTree(adj);

        return new Promise(resolve => {
            const start = performance.now();

            const step = (time) => {
                let t = (time - start) / 1000;
                if (t > duration) t = duration;

                FoldEngine.unfoldImmediate();

                const progress = t / duration;

                order.forEach(id => {
                    const p = parent[id];
                    if (p === -1) return;

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup  = faceGroups.find(g => g.faceId === id);

                    const relation = adj[p].find(r => r.to === id);
                    if (!relation) return;

                    const fp = faces.find(f => f.id === p);
                    const fc = faces.find(f => f.id === id);

                    const sign = getFoldSign(fp, fc, relation.edgeA);
                    const angle = sign * (Math.PI / 2) * progress;

                    parentGroup.updateMatrixWorld(true);
                    childGroup.updateMatrixWorld(true);

                    const { axis, point } = getAxisAndPoint(parentGroup, relation);

                    const inv = new THREE.Matrix4();
                    inv.getInverse(childGroup.matrixWorld);

                    const pivotLocal = point.clone().applyMatrix4(inv);

                    childGroup.position.sub(pivotLocal);

                    const axisLocal = axis.clone().applyMatrix4(inv).normalize();

                    childGroup.rotateOnAxis(axisLocal, angle);

                    childGroup.position.add(pivotLocal);
                    childGroup.updateMatrixWorld(true);
                });

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (t < duration) requestAnimationFrame(step);
                else resolve();
            };

            requestAnimationFrame(step);
        });
    };


    // ==========================================================
    //  PUBLIC: getFaceGroups
    // ==========================================================
    FoldEngine.getFaceGroups = () => faceGroups;

})();
