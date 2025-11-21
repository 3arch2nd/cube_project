/************************************************************
 * foldEngine.js — Cube Net → 3D 평면 + 힌지 접기 버전
 *  - t=0 : 2D 전개도와 위치/색 100% 일치 (center 정렬)
 *  - t∈(0,1) : 각 면이 힌지 축을 기준으로 회전
 *  - t=1 : 모두 90° 접힌 상태 (완전 정육면체는 아님, 그래도 구조적으로 접힘)
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene  = null;
    let camera = null;

    let facesSorted = [];          // id 기준 정렬된 face 리스트
    let nodes       = [];          // face.id → TransformNode
    let hingeInfo   = [];          // face.id → { parent, axis, pivot }

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;
    let netCenter = { x: 0, y: 0 };

    /************************************************************
     * INIT
     ************************************************************/
    FoldEngine.init = function (canvasElement, eng, scn) {
        canvas = canvasElement;

        if (eng && scn) {
            engine = eng;
            scene  = scn;
        } else {
            engine = new BABYLON.Engine(canvas, true);
            scene  = new BABYLON.Scene(engine);
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

        computeNetCenter(facesSorted);
        createMeshes();
        buildHingeTree(net.adjacency || []);
        layoutFlat();        // t=0 기준 위치
        setFoldProgress(0);  // 회전 0으로 초기화
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes     = [];
        hingeInfo = [];
    }

    /************************************************************
     * 전개도 중심 계산 (2D 좌표계)
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
     * 메쉬 생성 (각 face 당 Plane + TransformNode)
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            mat.emissiveColor    = BABYLON.Color3.FromHexString(face.color || "#999999");
            mat.backFaceCulling  = false;
            mat.disableLighting  = true;

            if (face._hidden) {
                mat.alpha      = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent  = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * BFS로 parent-child + 힌지 정보 계산
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue   = [0];

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
                        axis:   hinge.axis,
                        pivot:  hinge.pivot
                    };
                });
        }

        // 실제 TransformNode 계층에 parent 적용
        facesSorted.forEach(f => {
            const id = f.id;
            if (id === 0) {
                nodes[id].parent = null;
                return;
            }
            const h = hingeInfo[id];
            if (!h) return;
            nodes[id].parent = nodes[h.parent];
        });

        console.log("HINGE INFO:", hingeInfo);
    }

    function computeHinge(parent, child) {
        const S = options.cellSize;

        // child가 parent의 어느 방향에 있는지 (grid 기준)
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

        // 안전용 (실제로는 cube net이라 여기 안 들어와야 함)
        return {
            axis:  new BABYLON.Vector3(0, 0, 0),
            pivot: new BABYLON.Vector3(0, 0, 0)
        };
    }

    /************************************************************
     * 평면 배치 (2D 전개도와 100% 일치, center 기준)
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

            node.position           = new BABYLON.Vector3(x, y, 0);
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
     * foldProgress — parent-child 힌지 회전 적용
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const angle = foldProgress * (Math.PI / 2);   // 0 ~ 90도

        // 먼저 평면 기준 위치/회전으로 초기화
        layoutFlat();

        // root(0)는 회전 없음
        const queue   = [0];
        const visited = new Set([0]);

        while (queue.length) {
            const parentId = queue.shift();

            hingeInfo.forEach((hinge, id) => {
                if (!hinge || hinge.parent !== parentId) return;
                if (visited.has(id)) return;

                visited.add(id);
                queue.push(id);

                const node = nodes[id];
                if (!node) return;

                // local pivot 설정 후, 축 회전
                node.setPivotPoint(hinge.pivot.clone());
                const q = BABYLON.Quaternion.RotationAxis(hinge.axis, angle);
                node.rotationQuaternion = q;
            });
        }
    }

    /************************************************************
     * main.js 에서 사용하는 helper들
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = t => setFoldProgress(t);
    FoldEngine.foldStaticTo    = rad => setFoldProgress(rad / (Math.PI / 2));
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
