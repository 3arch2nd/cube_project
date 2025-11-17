/**
 * ui.js
 * ------------------------------------------
 * 새로운 index + main.js 구조에 맞는 UI 모듈
 * - 전개도 그리기(2D)
 * - 조각 배치 기능(removeOne)
 * - click → placement
 * - 겹침 문제는 Overlap.js가 직접 처리 (UI는 관여 X)
 * ------------------------------------------
 */

(function () {
    "use strict";

    const UI = {};
    window.UI = UI;

    // 상태
    let canvas = null;
    let ctx = null;
    let currentNet = null;
    let removedFaceId = null;
    let candidatePositions = [];
    let placed = null;

    const FACE_SIZE = 80;
    const COLORS = {
        empty: "#ffffff",
        face: "#e0e0e0",
        border: "#333",
        highlight: "#ffd966",
        candidate: "#b6d7a8"
    };

    // ===============================
    // 초기화 및 초기 상태
    // ===============================
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");

        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
    };

    // ===============================
    // 전개도 렌더링
    // ===============================
    UI.renderNet = function (net, options = {}) {
        /**
         * options:
         *   removeOne: true/false
         *   highlightPositions: true/false
         */
        currentNet = JSON.parse(JSON.stringify(net));
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // face 하나 제거 처리
        if (options.removeOne) {
            if (removedFaceId === null) {
                removedFaceId = pickLeafFace(currentNet);
                computeCandidatePositions(currentNet, removedFaceId);
            }
        } else {
            removedFaceId = null;
            candidatePositions = [];
        }

        // face 그리기
        currentNet.faces.forEach(face => {
            const { u, v, id } = face;

            if (id === removedFaceId) {
                drawRect(u, v, COLORS.empty, true);
            } else {
                drawRect(u, v, COLORS.face, false);
            }
        });

        // 배치 후보 표시
        if (options.highlightPositions) {
            candidatePositions.forEach(pos => {
                drawRect(pos.u, pos.v, COLORS.candidate, false);
            });
        }

        // 실제 배치된 조각 강조
        if (placed) {
            drawRect(placed.u, placed.v, COLORS.highlight, false);
        }
    };

    // ===============================
    // 사각형 그리기
    // ===============================
    function drawRect(u, v, fill, dashed) {
        const x = u * FACE_SIZE;
        const y = v * FACE_SIZE;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 2;

        if (dashed) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.rect(x, y, FACE_SIZE, FACE_SIZE);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // ===============================
    // 제거할 face 선택 (leaf face)
    // ===============================
    function pickLeafFace(net) {
        const adj = CubeNets.getNetById(net.id).adjacency;

        const degree = {};
        adj.forEach(a => {
            degree[a.from] = (degree[a.from] || 0) + 1;
        });

        for (const id in degree) {
            if (degree[id] === 1) return parseInt(id);
        }
        return 0;
    }

    // ===============================
    // 후보 위치 계산
    // ===============================
    function computeCandidatePositions(net, removedFace) {
        const faces = net.faces.filter(f => f.id !== removedFace);

        const used = {};
        faces.forEach(f => {
            used[f.u + "," + f.v] = true;
        });

        const dirs = [
            [ 1, 0 ],
            [-1, 0 ],
            [ 0, 1 ],
            [ 0,-1 ]
        ];

        const candidates = [];

        faces.forEach(f => {
            dirs.forEach(([du, dv]) => {
                const nu = f.u + du;
                const nv = f.v + dv;
                const key = nu + "," + nv;

                if (!used[key]) {
                    candidates.push({u: nu, v: nv});
                }
            });
        });

        // 중복 제거
        const uniq = {};
        candidatePositions = [];

        candidates.forEach(p => {
            const k = p.u + "," + p.v;
            if (!uniq[k]) {
                uniq[k] = true;
                candidatePositions.push(p);
            }
        });
    }

    // ===============================
    // 클릭 이벤트 (조각 배치)
    // ===============================
    function onCanvasClick(evt) {
        if (!currentNet || removedFaceId === null) return;

        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        const u = Math.floor(x / FACE_SIZE);
        const v = Math.floor(y / FACE_SIZE);

        // 후보 위치만 클릭 가능
        for (const pos of candidatePositions) {
            if (pos.u === u && pos.v === v) {
                placed = {u, v};
                UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                return;
            }
        }
    }

    // ===============================
    // 조각 배치 결과 검증
    // ===============================
    UI.checkPieceResult = function (net) {
        if (!placed || removedFaceId === null) return false;

        const newNet = JSON.parse(JSON.stringify(net));

        const f = newNet.faces.find(face => face.id === removedFaceId);
        if (!f) return false;

        f.u = placed.u;
        f.v = placed.v;

        return Validator.isValidCubeNet(newNet);
    };

    // ===============================
    // 겹침 문제 검증 - main.js에서 Overlap 사용
    // ===============================
    UI.checkOverlapResult = function (net) {
        const selections = Overlap.getSelections();
        if (!selections.first || !selections.second) return false;

        const faceGroups = FoldEngine.getFaceGroups();
        const geom = Validator.extractCubeGeometry(faceGroups);

        return Validator.checkOverlap(geom, selections.first, selections.second);
    };

    // ===============================
    // NetRenderer: 겹침 모드에서 사용
    // ===============================
    window.NetRenderer = {
        drawNet(ctx, net) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            net.faces.forEach(f => {
                const x = f.u * FACE_SIZE;
                const y = f.v * FACE_SIZE;

                ctx.save();
                ctx.fillStyle = "#e0e0e0";
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.rect(x, y, FACE_SIZE, FACE_SIZE);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
    };

})();
