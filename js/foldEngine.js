/************************************************************
 * foldEngine.js — 2단계 A단계 (힌지 축/피벗 계산만, 회전 없음)
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
    let netCenter = { x: 0, y: 0 };
    let hingeInfo = [];    

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;

    /************************************************************
     * INIT
     ************************************************************/
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
        setupEnvironment();
        startRenderLoop();
    };

    function setupCamera() {
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 2,
            Math.PI / 2.2,
            8,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
    }

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
        new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene);
    }

    /************************************************************
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        facesSorted = net.faces.slice().sort((a,b)=>a.id-b.id);
        computeNetCenter();
        createMeshes();
        buildHingeTree(net.adjacency || []);
        layoutFlat();
        setFoldProgress(0);

        console.log("HINGE INFO:", hingeInfo);
    };

    function disposeAll() {
        nodes.forEach(n => n?.dispose?.());
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * Mesh 생성
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_"+face.id,
                { size: size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_"+face.id, scene);
            const col = face.color || "#999999";
            mat.emissiveColor = BABYLON.Color3.FromHexString(col);
            mat.backFaceCulling = false;
            mat.disableLighting = true;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            const tnode = new BABYLON.TransformNode("node_"+face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * parent-child hinge tree
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo[0] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            const children = adjList.filter(a => a.from === parentId);
            children.forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const parent = facesSorted.find(f => f.id === parentId);
                const child = facesSorted.find(f => f.id === childId);

                const hinge = computeHinge(parent, child);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        // 트리 구조 연결
        facesSorted.forEach(face => {
            if (face.id === 0) return;

            const h = hingeInfo[face.id];
            if (!h) return;

            nodes[face.id].parent = nodes[h.parent];
        });
    }

    /************************************************************
     * HINGE 계산 (방향 기반)
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0,0,0);
        let pivot = new BABYLON.Vector3(0,0,0);

        // child가 parent 위
        if (child.v === parent.v - 1) {
            axis = new BABYLON.Vector3(1,0,0);
            pivot = new BABYLON.Vector3(0, S/2, 0);
        }
        // child가 parent 아래
        else if (child.v === parent.v + 1) {
            axis = new BABYLON.Vector3(1,0,0);
            pivot = new BABYLON.Vector3(0, -S/2, 0);
        }
        // child가 parent 왼쪽
        else if (child.u === parent.u - 1) {
            axis = new BABYLON.Vector3(0,1,0);
            pivot = new BABYLON.Vector3(-S/2, 0, 0);
        }
        // child가 parent 오른쪽
        else if (child.u === parent.u + 1) {
            axis = new BABYLON.Vector3(0,1,0);
            pivot = new BABYLON.Vector3(S/2, 0, 0);
        }

        return { axis, pivot };
    }

    /************************************************************
     * 평면 배치
     ************************************************************/
    function computeNetCenter() {
        let minU=999, maxU=-999, minV=999, maxV=-999;
        facesSorted.forEach(f=>{
            minU=Math.min(minU, f.u);
            maxU=Math.max(maxU, f.u+f.w);
            minV=Math.min(minV, f.v);
            maxV=Math.max(maxV, f.v+f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }

    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];

            const cx = f.u + f.w/2;
            const cy = f.v + f.h/2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x,y,0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        if (camera) camera.target = new BABYLON.Vector3(0,0,0);
    }

    /************************************************************
     * 아직 회전은 없음
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1,t));
        layoutFlat(); 
    }

    FoldEngine.setFoldProgress = setFoldProgress;
    FoldEngine.unfoldImmediate = ()=> setFoldProgress(0);
    FoldEngine.foldImmediate   = ()=> setFoldProgress(1);
    FoldEngine.foldTo          = (t)=> setFoldProgress(t);

    /************************************************************
     * Render Loop
     ************************************************************/
    function startRenderLoop() {
        engine.runRenderLoop(()=>{ scene.render(); });
    }

    FoldEngine.onResize = ()=> engine.resize();

})();
