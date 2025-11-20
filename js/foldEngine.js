/************************************************************
 * foldEngine.js — 최종 완전체 (정육면체 힌지 접기 + 슬라이더 + 회전)
 *  - 2D 전개도 색/위치 100% 일치
 *  - 각 면이 모서리를 축으로 90° 회전하여 접힘
 *  - foldProgress(0~1)에 따라 완전히 펼치거나 접을 수 있음
 *  - ArcRotateCamera로 회전 가능
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];
    let nodes = [];
    let netAdj = [];

    // 힌지 구조: 각 face.parentId, hingeAxis, hingeDir
    let hingeInfo = [];

    // foldProgress: 0=펼침, 1=완전 접힘
    let foldProgress = 0;

    const options = {
        cellSize: 1,
        bgColor: "#ffffff"
    };

    /******************************************************
     * INIT
     ******************************************************/
    FoldEngine.init = function (canvasElement, eng, scn) {
        canvas = canvasElement;

        if (eng && scn) {
            engine = eng;
            scene = scn;
        } else {
            engine = new BABYLON.Engine(canvas, true);
            scene = new BABYLON.Scene(engine);
        }

        setupCamera();
        setupLight();
        startRender();

        // 외부에서 슬라이더 업데이트할 때 호출
        FoldEngine.setFoldProgress = setFoldProgress;
    };

    function setupCamera() {
        camera = new BABYLON.ArcRotateCamera(
            "arcCam",
            Math.PI / 4,
            Math.PI / 4,
            8,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
    }

    function setupLight() {
        const light = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.7;
    }

    /******************************************************
     * PUBLIC: loadNet
     ******************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        facesSorted = net.faces.slice();
        netAdj = net.adjacency || [];

        createMeshes();
        buildHinges();       // parent-child 구조 구성
        layoutFlat();        // 펼친 상태로 배치
        applyFold();         // foldProgress 반영
    };

    function disposeAll() {
        if (nodes.length) nodes.forEach(n => n?.dispose?.());
        nodes = [];
        hingeInfo = [];
    }

    /******************************************************
     * Mesh 생성
     ******************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const p = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: options.cellSize, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            let col = face.color || "#aaaaaa";
            mat.diffuseColor = BABYLON.Color3.FromHexString(col);
            mat.backFaceCulling = false;

            // parent-child 회전을 위해 TransformNode 사용
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            p.parent = tnode;

            nodes[face.id] = tnode;

            // plane 위치는 상대좌표 → 부모 TransformNode에서 회전 처리
            p.position.z = 0;
        });
    }

    /******************************************************
     * Hinge(부모-자식 연결) 구축
     ******************************************************/
    function buildHinges() {
        // face 0을 root로 본다
        const visited = new Set([0]);
        const queue = [0];

        hingeInfo[0] = { parent: null, axis: new BABYLON.Vector3(0, 0, 0), pivot: new BABYLON.Vector3(0, 0, 0) };

        while (queue.length) {
            const f = queue.shift();
            const adjList = netAdj.filter(a => a.from === f);

            adjList.forEach(a => {
                if (visited.has(a.to)) return;
                visited.add(a.to);
                queue.push(a.to);

                // 부모 face = f
                const parentId = f;
                const childId = a.to;

                // hinge는 "parent face와 child face가 맞닿은 Edge 기준"
                // 2D grid에서는 f, a.to의 (u,v)을 비교하면 hinge 방향 할당 가능
                const parent = facesSorted.find(x => x.id === parentId);
                const child = facesSorted.find(x => x.id === childId);

                const hinge = computeHinge(parent, child);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        // parent-child 계층 구조 설정
        facesSorted.forEach(face => {
            const h = hingeInfo[face.id];
            if (h && h.parent !== null) {
                nodes[face.id].parent = nodes[h.parent];
            }
        });
    }

    /******************************************************
     * hinge 계산
     ******************************************************/
    function computeHinge(parent, child) {
        const size = options.cellSize;

        let pivot = new BABYLON.Vector3(0, 0, 0);
        let axis = new BABYLON.Vector3(0, 0, 0);

        // 같은 v ⇒ 위아래
        if (child.v === parent.v - 1) {
            // child가 parent 위
            pivot = new BABYLON.Vector3(0, size / 2, 0);
            axis = new BABYLON.Vector3(1, 0, 0);
        } else if (child.v === parent.v + 1) {
            // child가 parent 아래
            pivot = new BABYLON.Vector3(0, -size / 2, 0);
            axis = new BABYLON.Vector3(1, 0, 0);
        }

        // 같은 u ⇒ 좌우
        if (child.u === parent.u - 1) {
            // child가 parent 왼쪽
            pivot = new BABYLON.Vector3(-size / 2, 0, 0);
            axis = new BABYLON.Vector3(0, -1, 0);
        } else if (child.u === parent.u + 1) {
            // child가 parent 오른쪽
            pivot = new BABYLON.Vector3(size / 2, 0, 0);
            axis = new BABYLON.Vector3(0, 1, 0);
        }

        return { axis, pivot };
    }

    /******************************************************
     * 펼친 상태로 위치 배치(2D와 100% 동기화)
     ******************************************************/
    function layoutFlat() {
        facesSorted.forEach(face => {
            const n = nodes[face.id];
            if (!n) return;

            const x = face.u * options.cellSize;
            const y = -face.v * options.cellSize;
            n.position = new BABYLON.Vector3(x, y, 0);
        });
    }

    /******************************************************
     * foldProgress(0~1)에 따라 모든 face 회전 적용
     ******************************************************/
    function applyFold() {
        facesSorted.forEach(face => {
            const id = face.id;
            if (id === 0) return; // root는 회전 없음

            const h = hingeInfo[id];
            if (!h) return;

            const n = nodes[id];

            const angle = foldProgress * (Math.PI / 2); // 90도 회전
            n.setPivotPoint(h.pivot);
            n.rotation = h.axis.scale(angle); // axis 방향으로 회전
        });
    }

    /******************************************************
     * 외부에서 슬라이더 등으로 호출
     ******************************************************/
    function setFoldProgress(value) {
        foldProgress = Math.max(0, Math.min(1, value));
        applyFold();
    }

    /******************************************************
     * FoldEngine.getFaceGroups - validator용
     ******************************************************/
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    /******************************************************
     * render loop
     ******************************************************/
    function startRender() {
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        engine?.resize();
    };

})();
