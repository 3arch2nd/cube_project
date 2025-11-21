/************************************************************
 * foldEngine.js — 평면 매핑 + 힌지 접기 완성 버전 (Babylon.js)
 *  - 2D 전개도와 3D 평면 배치 100% 일치
 *  - net.adjacency 의 dir(up/down/left/right)을 이용해 힌지 계산
 *  - foldProgress(0~1)에 따라 각 면이 90°까지 회전
 *  - ArcRotateCamera 로 마우스로 회전 가능
 *
 *  외부에서 사용하는 API:
 *    FoldEngine.init(canvas, engine?, scene?)
 *    FoldEngine.loadNet(net)          // {faces[], adjacency[]}
 *    FoldEngine.setFoldProgress(t)    // 0~1
 *    FoldEngine.unfoldImmediate()
 *    FoldEngine.foldImmediate()
 *    FoldEngine.foldTo(t)
 *    FoldEngine.foldStaticTo(rad)
 *    FoldEngine.foldAnimate()
 *    FoldEngine.getFaceGroups()
 *    FoldEngine.onResize()
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];          // id 순으로 정렬된 face 목록
    let nodes = [];                // face.id → TransformNode
    let hingeInfo = [];            // face.id → { parent, axis, pivot, sign }
    let netCenter = { x: 0, y: 0 };

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
        new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0, 1, 0), scene);
    }

    /************************************************************
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        // id 기준 정렬
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter(facesSorted);
        createMeshes();                 // nodes 생성 (parent 없음, 원점)
        layoutFlat();                   // 2D와 동일한 world 좌표로 배치
        buildHingeTree(net.adjacency || []); // parent / hinge / local pos 설정
        setFoldProgress(0);             // 완전히 펼친 상태
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
        facesSorted = [];
    }

    /************************************************************
     * 전개도 중심 계산 (cell 좌표 기준)
     ************************************************************/
    function computeNetCenter(faces) {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        faces.forEach(f => {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }

    /************************************************************
     * 메쉬 생성 (TransformNode + Plane)
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

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

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * 평면 배치 (2D와 100% 동일)
     *  - 아직 부모/자식 관계는 없음 (모두 scene의 자식)
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        let sumX = 0, sumY = 0, count = 0;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());

            sumX += x;
            sumY += y;
            count++;
        });

        // 전개도 중심 기준으로 카메라 타깃 자동 맞춤
        if (camera && count > 0) {
            const centerX = sumX / count;
            const centerY = sumY / count;
            camera.target = new BABYLON.Vector3(centerX, centerY, 0);
        }
    }

    /************************************************************
     * BFS hinge tree + parent/localPos 세팅
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo = [];
        hingeInfo[0] = { parent: null, axis: null, pivot: null, sign: 0 };

        while (queue.length) {
            const parentId = queue.shift();
            const parentNode = nodes[parentId];

            // parent에서 뻗어 나가는 간선들
            const children = adjList.filter(a => a.from === parentId);
            children.forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const childNode = nodes[childId];
                if (!parentNode || !childNode) return;

                // 현재 world 좌표(부모 없음 상태)에서 local 좌표 계산
                const worldChild = childNode.position.clone();
                const worldParent = parentNode.position.clone();
                const local = worldChild.subtract(worldParent);

                childNode.position = local;      // 부모 기준 local pos
                childNode.parent = parentNode;   // 계층 구조 설정

                // dir 정보로 힌지 축/피벗 계산
                const hinge = computeHingeFromDir(a.dir);
                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot,
                    sign: hinge.sign
                };
            });
        }

        console.log("HINGE INFO:", hingeInfo);
    }

    function computeHingeFromDir(dir) {
        const S = options.cellSize;

        switch (dir) {
            case "up":    // child가 parent 위쪽
                return {
                    axis: new BABYLON.Vector3(1, 0, 0),
                    pivot: new BABYLON.Vector3(0, -S / 2, 0),
                    sign: +1
                };
            case "down":  // child가 parent 아래쪽
                return {
                    axis: new BABYLON.Vector3(1, 0, 0),
                    pivot: new BABYLON.Vector3(0,  S / 2, 0),
                    sign: -1
                };
            case "left":  // child가 parent 왼쪽
                return {
                    axis: new BABYLON.Vector3(0, 1, 0),
                    pivot: new BABYLON.Vector3( S / 2, 0, 0),
                    sign: +1
                };
            case "right": // child가 parent 오른쪽
                return {
                    axis: new BABYLON.Vector3(0, 1, 0),
                    pivot: new BABYLON.Vector3(-S / 2, 0, 0),
                    sign: -1
                };
            default:
                return {
                    axis: new BABYLON.Vector3(0, 0, 0),
                    pivot: new BABYLON.Vector3(0, 0, 0),
                    sign: 0
                };
        }
    }

    /************************************************************
     * foldProgress — HINGE 회전 적용
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const baseAngle = foldProgress * (Math.PI / 2); // 0~90°

        // 1) 모든 노드 회전 초기화
        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());
        });

        // 2) 각 face 에 대해 힌지 회전 적용 (root 제외)
        facesSorted.forEach(f => {
            const id = f.id;
            if (id === 0) return;

            const hinge = hingeInfo[id];
            if (!hinge || !hinge.axis || hinge.sign === 0) return;

            const node = nodes[id];
            if (!node) return;

            const angle = baseAngle * hinge.sign;

            node.setPivotPoint(hinge.pivot);
            node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                hinge.axis,
                angle
            );
        });
    }

    /************************************************************
     * 외부 API (main.js / validator.js 용)
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

    /************************************************************
     * Babylon render loop
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
