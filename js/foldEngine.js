/**
 * foldEngine.js – 정육면체 전개도 접기 엔진 (단순·안정 버전)
 *
 * 전제:
 *  - net.faces: [{ id, u, v, w, h }, ...]
 *  - (u, v)는 전개도 상의 왼쪽-위 좌표, w/h는 가로/세로 길이 (정육면체라면 w=h)
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];   // 각 면의 THREE.Group
    let parentOf   = [];   // folding tree (부모 face id)
    FoldEngine.currentNet = null;

    const WHITE   = 0xffffff;
    const OUTLINE = 0x333333;
    const EPS     = 1e-6;

    let netCenterU = 0;
    let netCenterV = 0;

    // 카메라 원래 위치 저장
    let initialCameraPos    = null;
    let initialCameraTarget = new THREE.Vector3(0, 0, 0);

    // --------------------------------------------------
    //  Three.js 초기화
    // --------------------------------------------------
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true
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
        initialCameraPos = camera.position.clone();

        const amb = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(amb);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        scene.add(camera);
    };

    // --------------------------------------------------
    // 정사각형 face geometry (로컬 기준: 중심이 (0,0,0))
    // --------------------------------------------------
    function createFaceGeometry(w, h) {
        const geom = new THREE.Geometry();
        const hw = w / 2;
        const hh = h / 2;

        // (x 오른쪽+, y 위쪽+)
        geom.vertices.push(
            new THREE.Vector3(-hw, -hh, 0), // 0: BL
            new THREE.Vector3( hw, -hh, 0), // 1: BR
            new THREE.Vector3( hw,  hh, 0), // 2: TR
            new THREE.Vector3(-hw,  hh, 0)  // 3: TL
        );

        // 두 삼각형
        geom.faces.push(new THREE.Face3(0, 1, 2));
        geom.faces.push(new THREE.Face3(0, 2, 3));
        geom.computeFaceNormals();

        return geom;
    }

    // --------------------------------------------------
    // 전개도 → 3D 면 group 생성
    // --------------------------------------------------
    FoldEngine.loadNet = function (net) {
        FoldEngine.currentNet = net;
        faceGroups = [];

        // 기존 Group 삭제
        scene.children
            .filter(o => o.type === 'Group')
            .forEach(o => scene.remove(o));

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);

        // 전개도 전체 중심 (u, v) 계산
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        faces.forEach(f => {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenterU = (minU + maxU) / 2;
        netCenterV = (minV + maxV) / 2;

        // 면 group 생성
        faces.forEach(face => {
            const { id, u, v, w, h } = face;

            const group = new THREE.Group();
            group.faceId = id;

            const geom = createFaceGeometry(w, h);
            const mat  = new THREE.MeshLambertMaterial({
                color: WHITE,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geom, mat);

            const edges = new THREE.EdgesGeometry(geom);
            const line  = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: OUTLINE })
            );

            group.add(mesh);
            group.add(line);

            // 전개도 상의 중심 좌표 → 3D 위치 (z=0)
            const cx = u + w / 2;
            const cy = v + h / 2;

            const px = cx - netCenterU;
            const py = -(cy - netCenterV); // y축 반전

            group.position.set(px, py, 0);
            group.rotation.set(0, 0, 0);
            group.updateMatrixWorld(true);

            // 초기 상태 저장
            group.userData.initialPosition   = group.position.clone();
            group.userData.initialQuaternion = group.quaternion.clone();
            group.userData.size = { w, h };

            scene.add(group);
            faceGroups.push(group);
        });

        // id순 정렬
        faceGroups.sort((a, b) => a.faceId - b.faceId);

        return new Promise(resolve => {
            scene.updateMatrixWorld(true);
            renderer.render(scene, camera);
            requestAnimationFrame(resolve);
        });
    };

    // --------------------------------------------------
    // 펼친 상태로 리셋
    // --------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        faceGroups.forEach(g => {
            if (g.userData.initialPosition) {
                g.position.copy(g.userData.initialPosition);
            }
            if (g.userData.initialQuaternion) {
                g.quaternion.copy(g.userData.initialQuaternion);
            } else {
                g.rotation.set(0, 0, 0);
            }
            g.updateMatrixWorld(true);
        });
        scene.updateMatrixWorld(true);
        renderer.render(scene, camera);
    };

    // --------------------------------------------------
    // adjacency: 전개도 상에서 edge 공유하는 면들 찾기
    //  edge index: 0=top, 1=right, 2=bottom, 3=left
    // --------------------------------------------------
    function buildAdjacency(net) {
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = faces.reduce((m, f) => Math.max(m, f.id), -1);
        const adj   = [...Array(maxId + 1)].map(() => []);

        function edgesOf(f) {
            return [
                { a:[f.u,             f.v            ], b:[f.u + f.w,     f.v           ] }, // top
                { a:[f.u + f.w,       f.v            ], b:[f.u + f.w,     f.v + f.h     ] }, // right
                { a:[f.u + f.w,       f.v + f.h      ], b:[f.u,           f.v + f.h     ] }, // bottom
                { a:[f.u,             f.v + f.h      ], b:[f.u,           f.v           ] }  // left
            ];
        }

        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = edgesOf(fi);

            for (let j = i + 1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = edgesOf(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        const A = Ei[ei], B = Ej[ej];
                        if (
                            Math.abs(A.a[0] - B.b[0]) < EPS &&
                            Math.abs(A.a[1] - B.b[1]) < EPS &&
                            Math.abs(A.b[0] - B.a[0]) < EPS &&
                            Math.abs(A.b[1] - B.a[1]) < EPS
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

    // --------------------------------------------------
    // BFS folding tree 생성 (root = id가 가장 작은 face)
    // --------------------------------------------------
    function buildTree(adj) {
        const ids   = faceGroups.map(g => g.faceId);
        const maxId = Math.max.apply(null, ids);

        const parent = Array(maxId + 1).fill(null);
        const rootId = ids[0];
        parent[rootId] = -1;

        const order = [];
        const Q = [rootId];

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

    // --------------------------------------------------
    // 부모 면의 edgeA에 해당하는 실제 3D 회전축 (axis, point) 계산
    //  - face geometry는 중심 기준 정사각형
    //  - vertex index: 0=BL,1=BR,2=TR,3=TL
    //
    //  edgeA:
    //   0: top    (TL -> TR)
    //   1: right  (TR -> BR)
    //   2: bottom (BR -> BL)
    //   3: left   (BL -> TL)
    // --------------------------------------------------
    function getAxisAndPoint(parentGroup, relation) {
        const size = parentGroup.userData.size || { w: 1, h: 1 };
        const hw = size.w / 2;
        const hh = size.h / 2;

        const cornersLocal = [
            new THREE.Vector3(-hw, -hh, 0), // 0: BL
            new THREE.Vector3( hw, -hh, 0), // 1: BR
            new THREE.Vector3( hw,  hh, 0), // 2: TR
            new THREE.Vector3(-hw,  hh, 0)  // 3: TL
        ];

        // edgeA → (v1, v2)
        let i1, i2;
        switch (relation.edgeA) {
            case 0: i1 = 3; i2 = 2; break; // top: TL->TR
            case 1: i1 = 2; i2 = 1; break; // right: TR->BR
            case 2: i1 = 1; i2 = 0; break; // bottom: BR->BL
            case 3: i1 = 0; i2 = 3; break; // left: BL->TL
            default:
                i1 = 0; i2 = 1;
        }

        const p1_world = cornersLocal[i1].clone().applyMatrix4(parentGroup.matrixWorld);
        const p2_world = cornersLocal[i2].clone().applyMatrix4(parentGroup.matrixWorld);

        const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();

        return { axis, point: p1_world };
    }

    // --------------------------------------------------
    // fold 방향 부호 (+/-) 결정
    //  - 전개도 상에서 parent, child 중심 관계를 보고
    //    cube 바깥쪽으로 말리도록 방향 선택
    // --------------------------------------------------
    function getFoldSign(parentFace, childFace, edgeA) {
        const pcx = parentFace.u + parentFace.w / 2;
        const pcy = parentFace.v + parentFace.h / 2;
        const ccx = childFace.u  + childFace.w  / 2;
        const ccy = childFace.v  + childFace.h  / 2;

        const dx = ccx - pcx;
        const dy = ccy - pcy;

        switch (edgeA) {
            case 0: // parent 위쪽 edge
                return (dy < 0 ? -1 : 1);
            case 2: // parent 아래쪽 edge
                return (dy > 0 ?  1 : -1);
            case 1: // parent 오른쪽 edge
                return (dx > 0 ?  1 : -1);
            case 3: // parent 왼쪽 edge
                return (dx < 0 ? -1 : 1);
            default:
                return 1;
        }
    }

    // --------------------------------------------------
    // fold 애니메이션
    // --------------------------------------------------
    FoldEngine.foldAnimate = function (duration = 1) {
        const net = FoldEngine.currentNet;
        if (!net) return Promise.resolve();

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const adj   = buildAdjacency(net);
        const { parent, order } = buildTree(adj);
        parentOf = parent;

        if (!renderer) return Promise.resolve();

        return new Promise(resolve => {
            const start = performance.now();

            function animate(time) {
                let t = (time - start) / 1000;
                if (t > duration) t = duration;
                const progress = t / duration;

                // 1. 전개도 상태로 리셋
                FoldEngine.unfoldImmediate();

                // 2. BFS 순서대로 접기
                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; // root

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup  = faceGroups.find(g => g.faceId === faceId);
                    if (!parentGroup || !childGroup) return;

                    const relList  = adj[p] || [];
                    const relation = relList.find(r => r.to === faceId);
                    if (!relation) return;

                    const parentFace = faces.find(f => f.id === p);
                    const childFace  = faces.find(f => f.id === faceId);
                    if (!parentFace || !childFace) return;

                    const sign  = getFoldSign(parentFace, childFace, relation.edgeA);
                    const angle = sign * (Math.PI / 2) * progress;

                    parentGroup.updateMatrixWorld(true);
                    childGroup.updateMatrixWorld(true);

                    const { axis, point } = getAxisAndPoint(parentGroup, relation);
                    const worldPivot = point.clone();

                    // childGroup 기준 inverse matrix
                    const inv = new THREE.Matrix4();
                    inv.getInverse(childGroup.matrixWorld);

                    // worldPivot → child local
                    const pivotLocal = worldPivot.clone().applyMatrix4(inv);

                    // 축도 local로
                    const axisLocal = axis.clone().applyMatrix4(inv).normalize();

                    // pivot 기준 회전
                    childGroup.position.sub(pivotLocal);
                    childGroup.rotateOnAxis(axisLocal, angle);
                    childGroup.position.add(pivotLocal);
                    childGroup.updateMatrixWorld(true);
                });

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (t < duration) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(animate);
        });
    };

    // --------------------------------------------------
    // 완성된 뒤 카메라가 천천히 회전하며 3면이 보이게
    // --------------------------------------------------
    FoldEngine.showSolvedView = function (duration = 1.5) {
        if (!camera) return;

        const startPos = camera.position.clone();
        const startTime = performance.now();

        // 목표 위치: 약간 위에서, 오른쪽 앞쪽에서 바라보는 시점
        const targetPos = new THREE.Vector3(4, 3, 4);
        const targetLook = new THREE.Vector3(0, 0, 0);

        return new Promise(resolve => {
            function animate(time) {
                let t = (time - startTime) / 1000;
                if (t > duration) t = duration;
                const k = t / duration;

                // 선형 보간
                camera.position.lerpVectors(startPos, targetPos, k);
                camera.lookAt(targetLook);

                renderer.render(scene, camera);

                if (t < duration) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(animate);
        });
    };

    // --------------------------------------------------
    // getFaceGroups (validator.js에서 사용)
    // --------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return faceGroups;
    };

})();
