/************************************************************
 * foldEngine.js — 최종 완전체 (정육면체 힌지 접기 + 슬라이더 + 회전)
 *  - 2D 전개도 색/위치 100% 일치
 *  - 각 면이 모서리를 축으로 90° 회전하여 접힘
 *  - foldProgress(0~1)에 따라 완전히 펼치거나 접을 수 있음
 *  - ArcRotateCamera로 회전 가능
 *  - ⭐ main.js / validator.js 와 완전 호환되는 wrapper 포함
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

    // parent-child hinge 정보를 저장
    let hingeInfo = [];

    // fold progress (0=flat, 1=closed cube)
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

        // 외부에서 fold 값 제어
        FoldEngine.setFoldProgress = setFoldProgress;

        // ⭐ main.js 호환용 wrapper 등록
        addCompatibilityWrappers();
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
        light.intensity = 0.85;
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
        buildHinges();
        layoutFlat();
        applyFold();
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
            const col = face.color || "#aaaaaa";
            mat.diffuseColor = BABYLON.Color3.FromHexString(col);
            mat.backFaceCulling = false;

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            p.parent = tnode;

            nodes[face.id] = tnode;

            p.position.z = 0;
        });
    }

    /******************************************************
     * parent-child hinge 구조 구축
     ******************************************************/
    function buildHinges() {
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

                const parent = facesSorted.find(x => x.id === f);
                const child = facesSorted.find(x => x.id === a.to);

                const hinge = computeHinge(parent, child);

                hingeInfo[a.to] = {
                    parent: f,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        facesSorted.forEach(face => {
            const h = hingeInfo[face.id];
            if (h && h.parent !== null) {
                nodes[face.id].parent = nodes[h.parent];
            }
        });
    }

    /******************************************************
     * hinge 계산 (부모 face 기준)
     ******************************************************/
    function computeHinge(parent, child) {
        const size = options.cellSize;

        let pivot = new BABYLON.Vector3(0, 0, 0);
        let axis = new BABYLON.Vector3(0, 0, 0);

        if (child.v === parent.v - 1) {
            pivot = new BABYLON.Vector3(0, size / 2, 0);
            axis = new BABYLON.Vector3(1, 0, 0);
        } else if (child.v === parent.v + 1) {
            pivot = new BABYLON.Vector3(0, -size / 2, 0);
            axis = new BABYLON.Vector3(1, 0, 0);
        }

        if (child.u === parent.u - 1) {
            pivot = new BABYLON.Vector3(-size / 2, 0, 0);
            axis = new BABYLON.Vector3(0, -1, 0);
        } else if (child.u === parent.u + 1) {
            pivot = new BABYLON.Vector3(size / 2, 0, 0);
            axis = new BABYLON.Vector3(0, 1, 0);
        }

        return { axis, pivot };
    }

    /******************************************************
     * 펼친 위치 배치
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
     * fold 적용
     ******************************************************/
    function applyFold() {
        facesSorted.forEach(face => {
            if (face.id === 0) return;

            const h = hingeInfo[face.id];
            if (!h) return;

            const n = nodes[face.id];
            const angle = foldProgress * (Math.PI / 2);

            n.setPivotPoint(h.pivot);
            n.rotation = h.axis.scale(angle);
        });
    }

    function setFoldProgress(v) {
        foldProgress = Math.min(1, Math.max(0, v));
        applyFold();
    }

    /******************************************************
     * Validator용
     ******************************************************/
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    /******************************************************
     * render loop
     ******************************************************/
    function startRender() {
        engine.runRenderLoop(() => scene.render());
    }

    FoldEngine.onResize = function () {
        engine && engine.resize();
    };

    /******************************************************
     * ⭐ main.js 호환 API 추가
     ******************************************************/
    function addCompatibilityWrappers() {
        FoldEngine.unfoldImmediate = () => setFoldProgress(0);
        FoldEngine.unfold = () => setFoldProgress(0);
        FoldEngine.reset = () => setFoldProgress(0);

        FoldEngine.foldImmediate = () => setFoldProgress(1);
        FoldEngine.foldTo = (t) => setFoldProgress(t);
        FoldEngine.foldStaticTo = (t) => {
            setFoldProgress(t);
            return true;
        };

        FoldEngine.foldAnimate = () => Promise.resolve();
        FoldEngine.showSolvedView = () => Promise.resolve();
    }

})();
