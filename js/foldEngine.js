/************************************************************
 * foldEngine.js — 정육면체 전개도 3D 엔진 (A안)
 *  - 입력: net.faces[{id,u,v,w,h,color,_hidden?}], net.adjacency[{from,to,dir}]
 *  - 2D 전개도(인접 관계)를 그대로 3D 평면으로 배치
 *  - 슬라이더(0~1)에 맞춰 각 면이 90°까지 접히는 힌지 회전
 *  - ArcRotateCamera 로 자유 회전 가능
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    // face.id 기준
    let facesSorted = [];         // [{id,...}]
    let nodes = [];               // TransformNode (face.id 인덱스)
    let hingeInfo = [];           // { parent, axis, pivot, sign, dir }
    let gridPos = [];             // BFS로 구한 2D 격자 좌표 (root 기준)

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

        FoldEngine.setFoldProgress = setFoldProgress;
    };

    function setupCamera() {
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 4,      // 약간 비스듬히
            Math.PI / 3,
            8,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
    }

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
        new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0, 1, 0), scene);
    }

    /************************************************************
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        // id 순 정렬
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        createMeshes();                    // TransformNode + Plane 생성
        buildTreeFromAdjacency(net);       // parent-child + gridPos + hingeInfo
        centerRootByGrid();                // 전체 중심을 (0,0)에 오도록 root 이동
        setFoldProgress(0);                // 펼친 상태로 초기화
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
        gridPos = [];
    }

    /************************************************************
     * 메쉬 생성 (각 face.id 당 TransformNode 하나)
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

            // Plane 메쉬 (정사각형)
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            mat.emissiveColor = BABYLON.Color3.FromHexString(face.color || "#999999");
            mat.backFaceCulling = false;
            mat.disableLighting = true;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            // 회전/이동을 담당하는 TransformNode
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;       // 면의 로컬 원점은 면의 중심

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * 인접정보(adjacency)로 parent-child 트리 & 힌지 정보 구성
     *  - root: face 0
     *  - gridPos: root 기준 격자 좌표 (정수)
     ************************************************************/
    function buildTreeFromAdjacency(net) {
        const adjList = net.adjacency || [];
        if (!facesSorted.length) return;

        const S = options.cellSize;

        const visited = new Set();
        const queue = [];

        // root(0) 초기화
        visited.add(0);
        queue.push(0);
        gridPos[0] = { x: 0, y: 0 };
        hingeInfo[0] = { parent: null, axis: null, pivot: BABYLON.Vector3.Zero(), sign: 1, dir: null };
        nodes[0].parent = null;
        nodes[0].position = new BABYLON.Vector3(0, 0, 0);
        nodes[0].rotationQuaternion = BABYLON.Quaternion.Identity();

        while (queue.length) {
            const parentId = queue.shift();
            const parentGrid = gridPos[parentId];

            // parentId 에서 나가는 간선
            const childrenEdges = adjList.filter(a => a.from === parentId);

            childrenEdges.forEach(edge => {
                const childId = edge.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const dir = edge.dir;   // "up","down","left","right"
                let dx = 0, dy = 0;
                let pivotLocal = BABYLON.Vector3.Zero();
                let axis = BABYLON.Vector3.Zero();
                let sign = 1;

                // 격자/로컬 좌표는 root 평면 기준 (z=0)
                switch (dir) {
                    case "up":
                        dx = 0;  dy = 1;
                        // child가 parent 위쪽 (공유 edge = child의 bottom)
                        pivotLocal = new BABYLON.Vector3(0, -S / 2, 0);
                        axis = new BABYLON.Vector3(1, 0, 0);   // x축
                        sign = 1;
                        break;
                    case "down":
                        dx = 0;  dy = -1;
                        // child가 parent 아래쪽 (공유 edge = child의 top)
                        pivotLocal = new BABYLON.Vector3(0, S / 2, 0);
                        axis = new BABYLON.Vector3(1, 0, 0);
                        sign = -1;
                        break;
                    case "left":
                        dx = -1; dy = 0;
                        // child가 parent 왼쪽 (공유 edge = child의 right)
                        pivotLocal = new BABYLON.Vector3(S / 2, 0, 0);
                        axis = new BABYLON.Vector3(0, 1, 0);   // y축
                        sign = -1;
                        break;
                    case "right":
                        dx = 1;  dy = 0;
                        // child가 parent 오른쪽 (공유 edge = child의 left)
                        pivotLocal = new BABYLON.Vector3(-S / 2, 0, 0);
                        axis = new BABYLON.Vector3(0, 1, 0);
                        sign = 1;
                        break;
                    default:
                        console.warn("Unknown dir in adjacency:", dir);
                        break;
                }

                // 격자 좌표
                gridPos[childId] = {
                    x: parentGrid.x + dx,
                    y: parentGrid.y + dy
                };

                // TransformNode parent/position 설정
                const parentNode = nodes[parentId];
                const childNode = nodes[childId];

                childNode.parent = parentNode;
                childNode.position = new BABYLON.Vector3(dx * S, dy * S, 0);
                childNode.rotationQuaternion = BABYLON.Quaternion.Identity();

                // 힌지 정보 저장 (pivot은 child 로컬 기준)
                hingeInfo[childId] = {
                    parent: parentId,
                    axis: axis,
                    pivot: pivotLocal,
                    sign: sign,
                    dir: dir
                };
            });
        }

        // 디버깅용
        console.log("HINGE INFO:", hingeInfo);
        console.log("GRID POS:", gridPos);
    }

    /************************************************************
     * 전체 전개도의 중심을 (0,0)에 오도록 root(0) 위치 조정
     ************************************************************/
    function centerRootByGrid() {
        const S = options.cellSize;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        facesSorted.forEach(f => {
            const gp = gridPos[f.id];
            if (!gp) return;
            minX = Math.min(minX, gp.x);
            maxX = Math.max(maxX, gp.x);
            minY = Math.min(minY, gp.y);
            maxY = Math.max(maxY, gp.y);
        });

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        // root 의 position 을 전체 중심이 (0,0)이 되도록 이동
        const root = nodes[0];
        if (root) {
            root.position.x = -cx * S;
            root.position.y = -cy * S;
            root.position.z = 0;
        }

        // 카메라도 중심을 바라보도록
        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
    }

    /************************************************************
     * foldProgress — 0(완전 펼침) ~ 1(90° 접힘)
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const angle = foldProgress * (Math.PI / 2); // 0~90°

        // 모든 노드 회전 초기화 (트리 구조/position 은 유지)
        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero(), BABYLON.Space.LOCAL);
        });

        // root(0)는 회전 안 함
        facesSorted.forEach(f => {
            const id = f.id;
            if (id === 0) return;

            const hinge = hingeInfo[id];
            if (!hinge || !hinge.axis) return;

            const node = nodes[id];

            // child 로컬 좌표계에서 힌지 위치 지정
            node.setPivotPoint(hinge.pivot, BABYLON.Space.LOCAL);

            const q = BABYLON.Quaternion.RotationAxis(
                hinge.axis,
                angle * hinge.sign
            );
            node.rotationQuaternion = q;
        });
    }

    /************************************************************
     * main.js 에서 사용하는 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

    /************************************************************
     * Babylon 렌더 루프
     ************************************************************/
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = () => {
        if (engine) engine.resize();
    };

})();
