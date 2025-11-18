/**
 * ui.js – 정육면체 전개도 전용 (색깔 면 + 후보 위치 + 겹침 선택 표시)
 */

(function () {
    "use strict";

    const UI = {};
    window.UI = UI;

    let canvas = null;
    let ctx = null;

    let currentNet = null;
    let removedFaceId = null;
    let candidatePositions = [];

    UI.placed = null;

    const UNIT = 60;
    const EPS = 1e-6;
    let U_OFFSET = 0;
    let V_OFFSET = 0;

    // 연한 빨/노/초/파/보/분홍
    const FACE_COLORS = [
        "#ffcdd2", // red
        "#fff9c4", // yellow
        "#c8e6c9", // green
        "#bbdefb", // blue
        "#d1c4e9", // violet
        "#f8bbd0"  // pink
    ];

    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");

        canvas.removeEventListener("click", onCanvasClick);
        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        UI.placed = null;
        U_OFFSET = 0;
        V_OFFSET = 0;
    };

    UI.renderNet = function (net, options = {}) {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = JSON.parse(JSON.stringify(net));

        const isNetBuildMode =
            window.CubeProject &&
            window.CubeProject.currentProblem &&
            window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD;

        if (isNetBuildMode) {
            if (removedFaceId == null) removedFaceId = pickRemovableFace(net);
            computeCandidatePositions(currentNet);
        }

        calculateCenterOffset(currentNet, removedFaceId, UI.placed, isNetBuildMode);
        drawGrid();

        if (!isNetBuildMode) {
            if (window.Overlap && window.Overlap.getSelections) {
                const { first, second } = window.Overlap.getSelections();
                if (first) drawOverlapElement(first, "#ffd966");
                if (second) drawOverlapElement(second, "#ffc107");
            }
        }

        if (isNetBuildMode && options.highlightPositions) {
            for (const c of candidatePositions) {
                if (!isPositionOccupied(c)) {
                    drawFaceOutline(c, "#ddd", 1, "#f9f9f9");
                }
            }
        }

        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                const color = FACE_COLORS[f.id % FACE_COLORS.length];
                drawFace(f, color, "#333", "#aaa");
            }
        }

        if (UI.placed) {
            drawFaceOutline(UI.placed, "#ff9800", 4, "rgba(255,152,0,0.1)");
        }

        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };

    function calculateCenterOffset(net, removedId, placedPos, isNetBuildMode) {
        if (!net || !net.faces.length) return;

        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        const facesToConsider = net.faces.filter(f => f.id !== removedId);

        for (const f of facesToConsider) {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }

        if (isNetBuildMode && candidatePositions.length > 0) {
            for (const c of candidatePositions) {
                minU = Math.min(minU, c.u);
                maxU = Math.max(maxU, c.u + c.w);
                minV = Math.min(minV, c.v);
                maxV = Math.max(maxV, c.v + c.h);
            }
        }

        if (placedPos) {
            minU = Math.min(minU, placedPos.u);
            maxU = Math.max(maxU, placedPos.u + placedPos.w);
            minV = Math.min(minV, placedPos.v);
            maxV = Math.max(maxV, placedPos.v + placedPos.h);
        }

        const netWidth = maxU - minU;
        const netHeight = maxV - minV;
        const canvasSize = canvas.width;

        U_OFFSET = (canvasSize / UNIT - netWidth) / 2 - minU;
        V_OFFSET = (canvasSize / UNIT - netHeight) / 2 - minV;

        U_OFFSET = Math.round(U_OFFSET);
        V_OFFSET = Math.round(V_OFFSET);
    }

    function drawGrid() {
        const maxCells = Math.floor(canvas.width / UNIT) + 1;

        ctx.save();
        ctx.strokeStyle = "#ddd";
        ctx.lineWidth = 1;

        for (let i = 0; i < maxCells; i++) {
            ctx.beginPath();
            ctx.moveTo(i * UNIT, 0);
            ctx.lineTo(i * UNIT, canvas.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i * UNIT);
            ctx.lineTo(canvas.width, i * UNIT);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawFace(f, fill, outerStroke = "#333", innerStroke = "#aaa") {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;

        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();

        ctx.strokeStyle = innerStroke;
        ctx.lineWidth = 1;

        if (f.w > 0 && f.h > 0) {
            const cellW = Math.round(w / UNIT);
            const cellH = Math.round(h / UNIT);

            for (let i = 1; i < cellH; i++) {
                ctx.beginPath();
                ctx.moveTo(x, y + i * UNIT);
                ctx.lineTo(x + w, y + i * UNIT);
                ctx.stroke();
            }
            for (let i = 1; i < cellW; i++) {
                ctx.beginPath();
                ctx.moveTo(x + i * UNIT, y);
                ctx.lineTo(x + i * UNIT, y + h);
                ctx.stroke();
            }
        }

        ctx.strokeStyle = outerStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.stroke();

        ctx.restore();
    }

    function drawFaceOutline(f, color, lineWidth = 3, fillColor = 'transparent') {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // (옵션) 빗금 표시용 헬퍼 – 필요 시 validator에서 사용 가능
    function drawHatchedFace(f, strokeColor = "#f44336") {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;

        const step = 10;
        for (let sx = x - h; sx < x + w + h; sx += step) {
            ctx.beginPath();
            ctx.moveTo(sx, y + h);
            ctx.lineTo(sx + h, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawOverlapElement(elem, color) {
        if (!elem || !currentNet) return;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;

        const face = currentNet.faces.find(f => f.id === elem.face);
        if (!face) {
            ctx.restore();
            return;
        }

        if (elem.type === "vertex") {
            const x = (elem.x + U_OFFSET) * UNIT;
            const y = (elem.y + V_OFFSET) * UNIT;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
        } else if (elem.type === "edge") {
            const edges = getEdges(face);
            const edge = edges[elem.edge];

            const u1 = (edge.a[0] + U_OFFSET) * UNIT;
            const v1 = (edge.a[1] + V_OFFSET) * UNIT;
            const u2 = (edge.b[0] + U_OFFSET) * UNIT;
            const v2 = (edge.b[1] + V_OFFSET) * UNIT;

            ctx.beginPath();
            ctx.moveTo(u1, v1);
            ctx.lineTo(u2, v2);
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        ctx.restore();
    }

    function pickRemovableFace(net) {
        const adj = buildAdjacency(net);
        for (let i = 0; i < 6; i++) {
            if (adj[i].length === 1) return i;
        }
        return 0;
    }

    UI.getRemovedFaceId = function () {
        return removedFaceId;
    };

    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);
        for (let i = 0; i < net.faces.length; i++) {
            for (let j = i + 1; j < net.faces.length; j++) {
                const fi = net.faces[i];
                const fj = net.faces[j];

                const ei = getEdges(fi);
                const ej = getEdges(fj);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(ei[a], ej[b])) {
                            adj[fi.id].push({ to: fj.id, eA: a, eB: b });
                            adj[fj.id].push({ to: fi.id, eA: b, eB: a });
                        }
                    }
                }
            }
        }
        return adj;
    }

    function getEdges(f) {
        if (!f || f.w === undefined || f.h === undefined) return [];
        return [
            { a: [f.u, f.v], b: [f.u + f.w, f.v] },
            { a: [f.u + f.w, f.v], b: [f.u + f.w, f.v + f.h] },
            { a: [f.u + f.w, f.v + f.h], b: [f.u, f.v + f.h] },
            { a: [f.u, f.v + f.h], b: [f.u, f.v] }
        ];
    }

    function sameEdge(e1, e2) {
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }

    function edgeLength(edge) {
        const [x1, y1] = edge.a;
        const [x2, y2] = edge.b;
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function computeCandidatePositions(net) {
        candidatePositions = [];

        const removedFace = net.faces.find(f => f.id === removedFaceId);
        if (!removedFace) return;

        const activeFaces = net.faces.filter(f => f.id !== removedFaceId);

        for (const parent of activeFaces) {
            const edgesF = getEdges(parent);

            for (let eP = 0; eP < 4; eP++) {
                for (let eR = 0; eR < 4; eR++) {
                    const p_edge_len = edgeLength(edgesF[eP]);
                    const r_edge_len = edgeLength(getEdges(removedFace)[eR]);

                    if (Math.abs(p_edge_len - r_edge_len) > EPS) continue;

                    const pos = computePlacementByAttachment(parent, removedFace, eP, eR);
                    if (!pos) continue;

                    const isDuplicate = candidatePositions.some(c =>
                        Math.abs(c.u - pos.u) < EPS && Math.abs(c.v - pos.v) < EPS
                    );
                    if (!isDuplicate) candidatePositions.push(pos);
                }
            }
        }
    }

    function computePlacementByAttachment(parent, removed, eP, eR) {
        let ru, rv;
        switch (eP) {
            case 0: ru = parent.u; rv = parent.v - removed.h; break;
            case 1: ru = parent.u + parent.w; rv = parent.v; break;
            case 2: ru = parent.u; rv = parent.v + parent.h; break;
            case 3: ru = parent.u - removed.w; rv = parent.v; break;
            default: return null;
        }
        return { u: ru, v: rv, w: removed.w, h: removed.h };
    }

    function isPositionOccupied(pos) {
        for (const f of currentNet.faces) {
            if (
                f.id !== removedFaceId &&
                Math.abs(f.u - pos.u) < EPS &&
                Math.abs(f.v - pos.v) < EPS &&
                Math.abs(f.w - pos.w) < EPS &&
                Math.abs(f.h - pos.h) < EPS
            ) {
                return true;
            }
        }
        return false;
    }

    function onCanvasClick(evt) {
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (evt.clientX - rect.left);
        const y = (evt.clientY - rect.top);

        const u = x / UNIT - U_OFFSET;
        const v = y / UNIT - V_OFFSET;

        if (!currentNet || !window.CubeProject || !window.CubeProject.currentProblem) return;

        if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD) {
            if (removedFaceId == null) return;

            for (const pos of candidatePositions) {
                if (u >= pos.u && u < pos.u + pos.w && v >= pos.v && v < pos.v + pos.h) {
                    if (isPositionOccupied(pos)) return;

                    UI.placed = pos;
                    UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                    return;
                }
            }
        } else if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.OVERLAP_FIND) {
            const result = window.Overlap.recordClick(u, v);
            if (result) {
                UI.renderNet(currentNet, {});
                return;
            }
        }
    }

    UI.checkPieceResult = function (net) {
        if (!net || net.faces.length !== 6) {
            Validator.lastError = "검증을 위한 6조각 전개도가 준비되지 않았습니다.";
            return false;
        }
        return Validator.validateNet(net);
    };

    UI.checkOverlapResult = function (net) {
        return window.Overlap.checkUserAnswer(net);
    };

})();
