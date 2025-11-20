/************************************************************
 * foldEngine.js — 정육면체 전개도 Fold 엔진 (1차 완성본)
 *  - 2D 전개도와 3D 평면 배치 100% 정렬
 *  - adjacency 정보를 이용해 힌지 트리(parent-child) 구성
 *  - foldProgress(0~1)에 따라 0°→90° 접기
 *  - ArcRotateCamera로 회전 가능
 *
 *  외부에서 사용하는 API:
 *    FoldEngine.init(canvas, engine?, scene?)
 *    FoldEngine.loadNet(net)           // net.faces[], net.adjacency[]
 *    FoldEngine.setFoldProgress(t)     // 0~1 (html에서 직접 사용)
 *    FoldEngine.unfoldImmediate()
 *    FoldEngine.foldImmediate()
 *    FoldEngine.foldTo(t)
 *    FoldEngine.foldStaticTo(rad)
 *    FoldEngine.foldAnimate()
 *    FoldEngine.showSolvedView()
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

    let facesSorted = [];      // id 오름차순 faces
    let nodes = [];            // face.id → TransformNode (plane의 parent)
    let hingeInfo = [];        // face.id → { parent, axis, pivot }
    let netCenter = { x: 0, y: 0 };  // 전개도 중심(셀 좌표계)

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

        // 외부 슬라이더에서 직접 호출
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

        // id 순으로 정렬 (항상 0~5 가정)
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter(facesSorted);
        createMeshes();
        buildHingeTree(net.adjacency || []);

        // 처음에는 완전히 펼친 상태
        setFoldProgress(0);
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
     * 전개도 중심 계산 (셀 좌표계)
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
     * 메쉬 생성 (plane + parent TransformNode)
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

            // 회전/이동은 TransformNode에서 처리
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * BFS 기반 hinge 트리 구성 + 평면 위치 설정
     *  - rootId (기본 0)를 기준으로 parent-child 지정
     *  - 각 child의 local position은 parent 대비 offset으로 설정
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const S = options.cellSize;
        hingeInfo = [];

        // id → face 빠른 lookup
        const faceById = {};
        facesSorted.forEach(f => faceById[f.id] = f);

        const rootId = facesSorted[0].id;   // 보통 0
        const rootFace = faceById[rootId];
        const rootNode = nodes[rootId];

        // root 의 world 위치: 이전에 쓰던 공식 그대로
        const rootCx = rootFace.u + rootFace.w / 2;
        const rootCy = rootFace.v + rootFace.h / 2;
        const rootX  = (rootCx - netCenter.x) * S;
        const rootY  = (netCenter.y - rootCy) * S;

        rootNode.parent = null;
        rootNode.position = new BABYLON.Vector3(rootX, rootY, 0);
        rootNode.rotationQuaternion = BABYLON.Quaternion.Identity();

        hingeInfo[rootId] = { parent: null, axis: null, pivot: null };

        const visited = new Set([rootId]);
        const queue = [rootId];

        while (queue.length) {
            const parentId   = queue.shift();
            const parentFace = faceById[parentId];
            const parentNode = nodes[parentId];

            // parent와 인접한 child 들
            adjList
                .filter(a => a.from === parentId)
                .forEach(a => {
                    const childId = a.to;
                    if (visited.has(childId)) return;

                    visited.add(childId);
                    queue.push(childId);

                    const childFace = faceById[childId];
                    const childNode = nodes[childId];

                    // hinge axis/pivot 계산 (로컬 좌표계)
                    const hinge = computeHinge(parentFace, childFace);
                    hinge.parent = parentId;
                    hingeInfo[childId] = hinge;

                    // parent 대비 child 중심 offset (셀 좌표 → 3D)
                    const pCx = parentFace.u + parentFace.w / 2;
                    const pCy = parentFace.v + parentFace.h / 2;
                    const cCx = childFace.u + childFace.w / 2;
                    const cCy = childFace.v + childFace.h / 2;

                    const dxCells = cCx - pCx;       // 오른쪽이 +
                    const dyCells = cCy - pCy;       // 아래가 + (2D 기준)

                    const localX = dxCells * S;
                    const localY = -dyCells * S;     // 3D에서는 위가 +

                    childNode.parent = parentNode;
                    childNode.position = new BABYLON.Vector3(localX, localY, 0);
                    childNode.rotationQuaternion = BABYLON.Quaternion.Identity();
                });
        }

        // 카메라가 대략 전개도 중심을 보도록 (root가 이미 중심에 가까움)
        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }

        // 디버그용
        console.log("HINGE INFO:", hingeInfo);
    }

    /************************************************************
     * hinge 계산 (parent / child 의 상대 위치만으로 축/피벗 결정)
     *  - pivot 은 TransformNode 로컬 좌표계에서 edge 중심을 기준으로 함
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;

        // child 가 parent 의 어느 방향에 붙어있는지
        if (child.v === parent.v - 1) {
            // child ↑ parent (위)
            return {
                axis:  new BABYLON.Vector3(1, 0, 0),     // X축 회전
                pivot: new BABYLON.Vector3(0,  S / 2, 0) // 윗변
            };
        }
        if (child.v === parent.v + 1) {
            // child ↓ parent (아래)
            return {
                axis:  new BABYLON.Vector3(1, 0, 0),
                pivot: new BABYLON.Vector3(0, -S / 2, 0)
            };
        }
        if (child.u === parent.u - 1) {
            // child ← parent (왼쪽)
            return {
                axis:  new BABYLON.Vector3(0, 1, 0),     // Y축 회전
                pivot: new BABYLON.Vector3(-S / 2, 0, 0)
            };
        }
        if (child.u === parent.u + 1) {
            // child → parent (오른쪽)
            return {
                axis:  new BABYLON.Vector3(0, 1, 0),
                pivot: new BABYLON.Vector3( S / 2, 0, 0)
            };
        }

        // 이 경우는 거의 없지만, 안전용 기본값
        return {
            axis:  new BABYLON.Vector3(0, 0, 0),
            pivot: new BABYLON.Vector3(0, 0, 0)
        };
    }

    /************************************************************
     * foldProgress — parent-child 힌지 회전 적용
     *  - t=0  → 평면 전개도
     *  - t=1  → 각 면이 parent 기준 90° 접힘
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const angle = foldProgress * (Math.PI / 2); // 0 ~ 90도

        if (!facesSorted.length) return;

        // 우선 모든 face의 회전을 identity 로 초기화
        nodes.forEach(node => {
            if (!node) return;
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());
        });

        // BFS 순서대로 child에 회전 적용
        const rootId = facesSorted[0].id;
        const queue = [rootId];
        const visited = new Set([rootId]);

        while (queue.length) {
            const parentId = queue.shift();

            hingeInfo.forEach((hinge, id) => {
                if (!hinge || hinge.parent !== parentId) return;
                if (visited.has(id)) return;

                visited.add(id);
                queue.push(id);

                const node = nodes[id];
                if (!node) return;

                // 힌지(경첩) 설정
                node.setPivotPoint(hinge.pivot);

                // 축(axis)과 각도로 quaternion 생성
                const q = BABYLON.Quaternion.RotationAxis(hinge.axis, angle);
                node.rotationQuaternion = q;
            });
        }
    }

    /************************************************************
     * 외부 API (main.js에서 호출)
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
