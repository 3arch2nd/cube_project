/************************************************************
 * foldEngine.js — 평면 매핑 + 힌지 회전(1단계 구현)
 *  - 2D 전개도와 3D 평면 배치 100% 정렬
 *  - hingeInfo 기반으로 foldProgress(0~1)에 따라 회전
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
    let nodes = [];          // face.id → TransformNode
    let hingeInfo = [];      // face.id → { parent, axis, pivot }
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

        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);
        computeNetCenter(net.faces);

        createMeshes();
        buildHingeTree(net.adjacency || []);

        // 평면 상태로 위치 잡기 (한 번만)
        layoutFlat();

        // 최초 상태: 펼쳐진 상태
        setFoldProgress(0);
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * 전개도 중심 계산
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
     * 메쉬 생성
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

            // 회전용 부모 노드
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * BFS hinge tree (parent / axis / pivot + parent-child 연결)
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo[0] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            adjList
                .filter(a => a.from === parentId)
                .forEach(a => {
                    const childId = a.to;
                    if (visited.has(childId)) return;

                    visited.add(childId);
                    queue.push(childId);

                    const parent = facesSorted.find(f => f.id === parentId);
                    const child  = facesSorted.find(f => f.id === childId);

                    const hinge = computeHinge(parent, child);
                    hingeInfo[childId] = {
                        parent: parentId,
                        axis: hinge.axis,
                        pivot: hinge.pivot
                    };
                });
        }

        // 실제 TransformNode 계층 구조로 parent-child 적용
        facesSorted.forEach(f => {
            const h = hingeInfo[f.id];
            if (!h || h.parent == null) return;
            const parentNode = nodes[h.parent];
            const node       = nodes[f.id];
            if (parentNode && node) {
                node.parent = parentNode;
            }
        });

        console.log("HINGE INFO:", hingeInfo);
    }

    function computeHinge(parent, child) {
        const S = options.cellSize;

        // 위/아래/좌/우에 따라 축과 피벗 결정 (2D 기준)
        if (child.v === parent.v - 1) {
            // 위쪽
            return {
                axis:  new BABYLON.Vector3(1, 0, 0),
                pivot: new BABYLON.Vector3(0,  S / 2, 0)
            };
        }
        if (child.v === parent.v + 1) {
            // 아래쪽
            return {
                axis:  new BABYLON.Vector3(1, 0, 0),
                pivot: new BABYLON.Vector3(0, -S / 2, 0)
            };
        }
        if (child.u === parent.u - 1) {
            // 왼쪽
            return {
                axis:  new BABYLON.Vector3(0, 1, 0),
                pivot: new BABYLON.Vector3(-S / 2, 0, 0)
            };
        }
        if (child.u === parent.u + 1) {
            // 오른쪽
            return {
                axis:  new BABYLON.Vector3(0, 1, 0),
                pivot: new BABYLON.Vector3( S / 2, 0, 0)
            };
        }

        // 인접하지 않는 경우 (이상한 케이스) → 회전 없음
        return {
            axis:  new BABYLON.Vector3(0, 0, 0),
            pivot: new BABYLON.Vector3(0, 0, 0)
        };
    }

    /************************************************************
     * 평면 배치 + 카메라 중심 맞추기
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
            // 평면 기본 상태: 회전 없음
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());

            sumX += x;
            sumY += y;
            count++;
        });

        const centerX = sumX / count;
        const centerY = sumY / count;

        if (camera) {
            camera.target = new BABYLON.Vector3(centerX, centerY, 0);
        }
    }

    /************************************************************
     * foldProgress — 회전 적용 (HINGE 적용)
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const angle = foldProgress * (Math.PI / 2); // 0~90°

        // 먼저 모든 노드의 회전/피벗 초기화
        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());
        });

        // root(0)는 회전 없음
        const queue = [0];
        const visited = new Set([0]);

        while (queue.length) {
            const parent = queue.shift();

            hingeInfo.forEach((hinge, id) => {
                if (!hinge || hinge.parent !== parent) return;
                if (visited.has(id)) return;

                visited.add(id);
                queue.push(id);

                const node = nodes[id];
                if (!node) return;

                // 힌지 피벗 설정 (부모 좌표계 기준)
                node.setPivotPoint(hinge.pivot);

                // 회전축 quaternion 적용
                const q = BABYLON.Quaternion.RotationAxis(hinge.axis, angle);
                node.rotationQuaternion = q;
            });
        }

        // 위치는 layoutFlat()에서 이미 한 번 잡았으므로
        // 여기서는 다시 호출하지 않는다 (회전값이 덮어쓰이지 않도록).
    }

    /************************************************************
     * 외부 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

    /************************************************************
     * Babylon Loop
     ************************************************************/
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => scene.render());
    }

    FoldEngine.onResize = () => {
        if (engine) engine.resize();
    };

})();
