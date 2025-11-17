/**
 * foldEngine.js – Rectangular Prism 확장 버전
 *
 * 지원:
 *  - 정육면체 (w=h=1)
 *  - 직육면체 (face마다 w,h 다름)
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];   // 각 face의 Three.Group
    let parentOf = [];     // folding tree

    const WHITE = 0xffffff;
    const OUTLINE = 0x333333;

    // ---------------------------------------
    //  Three.js 초기화
    // ---------------------------------------
    FoldEngine.init = function (canvas) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(4, 4, 6);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        const amb = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(amb);
    };

    // ---------------------------------------
    // face geometry 생성 (w × h)
    // ---------------------------------------
    function createFaceGeometry(w, h) {
        const geom = new THREE.Geometry();

        // 중심을 기준으로 w,h만큼 사각형 생성
        const hw = w / 2;
        const hh = h / 2;

        geom.vertices.push(
            new THREE.Vector3(-hw, -hh, 0),
            new THREE.Vector3(hw, -hh, 0),
            new THREE.Vector3(hw, hh, 0),
            new THREE.Vector3(-hw, hh, 0)
        );

        geom.faces.push(new THREE.Face3(0, 1, 2));
        geom.faces.push(new THREE.Face3(0, 2, 3));
        geom.computeFaceNormals();

        return geom;
    }

    // ---------------------------------------
    // 2D 전개도 → 3D face group 생성
    // ---------------------------------------
    FoldEngine.loadNet = function (net) {
        // 리셋
        faceGroups = [];
        while (scene.children.length) scene.remove(scene.children[0]);

        // 카메라/빛 재추가
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));

        // faceGroup 생성
        net.faces.forEach(face => {
            const { id, u, v, w, h } = face;

            const group = new THREE.Group();
            group.faceId = id;

            const geom = createFaceGeometry(w, h);
            const mat = new THREE.MeshLambertMaterial({
                color: WHITE,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geom, mat);

            // outline
            const edges = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: OUTLINE }));

            group.add(mesh);
            group.add(line);

            // 전개도 좌표(u,v)에 따른 위치
            // u,v는 "칸" 개념이고 실제 크기는 face.w, face.h
            // 그러나 전개도는 정사각형 격자이므로,
            // 3D 위치는 unfold 단계에서 상대적 이동으로 처리할 것.
            group.position.set(u, v, 0);

            scene.add(group);
            faceGroups.push(group);
        });

        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // unfoldImmediate: 단순히 2D 평면에 펼친 상태 유지
    // ---------------------------------------
    FoldEngine.unfoldImmediate = function () {
        // 2D 평면 그대로이므로 별도 동작 없음
        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // adjacency 생성
    // ---------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);

        function edgesOf(f) {
            // u,v 좌표 기준 edge 정보 (격자 기반)
            return [
                { a:[f.u, f.v], b:[f.u + f.w, f.v] },         // 위 edge (가로 w)
                { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v+f.h]}, // 오른쪽 edge (세로 h)
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]},   // 아래 edge (가로 w)
                { a:[f.u, f.v+f.h], b:[f.u, f.v] }             // 왼쪽 edge (세로 h)
            ];
        }

        for (let i = 0; i < net.faces.length; i++) {
            const fi = net.faces[i];
            const Ei = edgesOf(fi);

            for (let j = i + 1; j < net.faces.length; j++) {
                const fj = net.faces[j];
                const Ej = edgesOf(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (
                            Ei[ei].a[0] === Ej[ej].b[0] && Ei[ei].a[1] === Ej[ej].b[1] &&
                            Ei[ei].b[0] === Ej[ej].a[0] && Ei[ei].b[1] === Ej[ej].a[1]
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

    // ---------------------------------------
    // BFS folding tree
    // ---------------------------------------
    function buildTree(adj) {
        const parent = Array(6).fill(null);
        parent[0] = -1;

        const order = [];
        const Q = [0];

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

    // ---------------------------------------
    // edgeIndex에 따른 회전축 계산
    // ---------------------------------------
    function getEdgeWorldAxis(parentGroup, face) {
        const w = face.w;
        const h = face.h;

        const px = parentGroup.position.x;
        const py = parentGroup.position.y;

        // parent 중심 기준 edge
        let ax1, ax2;

        switch (face.edgeA) {
            case 0: // top edge → 좌→우 방향(w)
                ax1 = new THREE.Vector3(px - w/2, py, 0);
                ax2 = new THREE.Vector3(px + w/2, py, 0);
                break;
            case 1: // right edge → 위→아래(h)
                ax1 = new THREE.Vector3(px, py - h/2, 0);
                ax2 = new THREE.Vector3(px, py + h/2, 0);
                break;
            case 2: // bottom → 좌→우
                ax1 = new THREE.Vector3(px - w/2, py, 0);
                ax2 = new THREE.Vector3(px + w/2, py, 0);
                break;
            case 3: // left → 위→아래
                ax1 = new THREE.Vector3(px, py - h/2, 0);
                ax2 = new THREE.Vector3(px, py + h/2, 0);
                break;
        }
        return { ax1, ax2 };
    }

    // ---------------------------------------
    // foldAnimate (직육면체 지원)
    // ---------------------------------------
    FoldEngine.foldAnimate = function (duration = 1) {
        const net = FoldEngine.currentNet;
        if (!net) return;

        // adjacency
        const adj = buildAdjacency(net);
        const { parent, order } = buildTree(adj);
        parentOf = parent;

        // 모든 child에 대해 rotate
        order.forEach(faceId => {
            const p = parent[faceId];
            if (p === -1) return;

            const parentGroup = faceGroups[p];
            const childGroup = faceGroups[faceId];

            const relation = adj[p].find(x => x.to === faceId);
            const faceObj = net.faces.find(f => f.id === faceId);
            faceObj.edgeA = relation.edgeA;

            const { ax1, ax2 } = getEdgeWorldAxis(parentGroup, faceObj);
            const axis = new THREE.Vector3().subVectors(ax2, ax1).normalize();

            childGroup.position.sub(parentGroup.position);
            childGroup.rotateOnWorldAxis(axis, Math.PI / 2);
            childGroup.position.add(parentGroup.position);
        });

        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // getFaceGroups (validator가 사용)
    // ---------------------------------------
    FoldEngine.getFaceGroups = function () {
        return faceGroups;
    };

})();
