/************************************************************
 * foldEngine.js — 평면 매핑 안정 버전 + (1단계) 힌지 구조만 구축
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
    let hingeInfo = [];    // parent/axis/pivot 저장

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
    };

    function disposeAll() {
        nodes.forEach(n => n?.dispose?.());
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * 메쉬 생성
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

            // TransformNode를 parent로 두기
            const tnode = new BABYLON.TransformNode("node_"+face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * (중요!!) parent-child 트리 구축
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        // BFS로 parent-child 관계 만들기 (root=0)
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

                // (핵심) hinge 계산
                const hinge = computeHinge(parent, child);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        // 트리 구조를 TransformNode에 반영
        facesSorted.forEach(face => {
            if (face.id === 0) return; // root

            const h = hingeInfo[face.id];
            if (!h) return;

            const parentNode = nodes[h.parent];
            const node = nodes[face.id];
            node.parent = parentNode;
        });
    }

    /************************************************************
     * parent-child 사이 경첩 면 찾기
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0,0,0);
        let pivot = new BABYLON.Vector3(0,0,0);

        // 2D 좌표에서 child가 parent의 어느 방향에 붙어 있는지 판단
        if (child.v === parent.v - 1) {
            // child가 parent의 위쪽
            axis = new BABYLON.Vector3(1,0,0);
            pivot = new BABYLON.Vector3(0,  S/2, 0);
        }
        else if (child.v === parent.v + 1) {
            // child가 parent의 아래쪽
            axis = new BABYLON.Vector3(1,0,0);
            pivot = new BABYLON.Vector3(0, -S/2, 0);
        }
        else if (child.u === parent.u - 1) {
            // child가 parent의 왼쪽
            axis = new BABYLON.Vector3(0,1,0);
            pivot = new BABYLON.Vector3(-S/2, 0, 0);
        }
        else if (child.u === parent.u + 1) {
            // child가 parent의 오른쪽
            axis = new BABYLON.Vector3(0,1,0);
            pivot = new BABYLON.Vector3( S/2, 0, 0);
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
        function layoutFlat() {
    const S = options.cellSize;

    facesSorted.forEach(f => {
        const node = nodes[f.id];

        // 2D 좌표를 그대로 3D에 반영 (좌상단 기준)
        const x = (f.u - netCenter.x) * S;
        const y = (netCenter.y - f.v) * S;

        node.position = new BABYLON.Vector3(x, y, 0);
        node.rotationQuaternion = BABYLON.Quaternion.Identity();
    });

    // 카메라도 전개도 중심을 보도록
    if (camera) camera.target = new BABYLON.Vector3(0, 0, 0);
}


    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f=>{
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
     * foldProgress — 아직은 평면 유지
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1,t));
        // 2단계에서 여기에 회전식 추가될 예정
        layoutFlat();
    }

    FoldEngine.setFoldProgress = setFoldProgress;

    /************************************************************
     * main.js가 요구하는 나머지 API
     ************************************************************/
    FoldEngine.unfoldImmediate = ()=> setFoldProgress(0);
    FoldEngine.foldImmediate = ()=> setFoldProgress(1);
    FoldEngine.foldTo = (t)=> setFoldProgress(t);
    FoldEngine.foldStaticTo = (rad)=> setFoldProgress(rad/(Math.PI/2));
    FoldEngine.foldAnimate = ()=> { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView = ()=> Promise.resolve();
    FoldEngine.getFaceGroups = ()=> nodes;

    /************************************************************
     * Render Loop
     ************************************************************/
    function startRenderLoop() {
        engine.runRenderLoop(()=>{ scene.render(); });
    }
    FoldEngine.onResize = ()=> engine.resize();

})();
