/**
 * ui.js – 수정된 버전 (굵은 대각선 빗금 + 안정적 렌더링)
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

    // -----------------------------------------------------
    // 초기화
    // -----------------------------------------------------
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");
        canvas.removeEventListener("click", onCanvasClick);
        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        UI.placed = null;
        U_OFFSET = 0;
        V_OFFSET = 0;
    };

    // -----------------------------------------------------
    // 전개도 렌더링
    // -----------------------------------------------------
    UI.renderNet = function (net, options = {}) {
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

        // 후보 위치 표시
        if (isNetBuildMode && options.highlightPositions) {
            for (const c of candidatePositions) {
                if (!isPositionOccupied(c)) {
                    drawFaceOutline(c, "#bbb", 1, "#f1f1f1");
                }
            }
        }

        // 기본 면
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                drawFace(f, "#f7f7f7", "#222", "#aaa");
            }
        }

        // 학생이 배치한 조각
        if (UI.placed) {
            drawFaceOutline(UI.placed, "#ff9900", 5);
        }

        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };

    // -----------------------------------------------------
    // 모눈
    // -----------------------------------------------------
    function drawGrid() {
        const max = Math.floor(canvas.width / UNIT) + 1;
        ctx.save();
        ctx.strokeStyle = "#e2e2e2";
        ctx.lineWidth = 1;
        for (let i = 0; i < max; i++) {
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

    // -----------------------------------------------------
    // 일반 면 그리기
    // -----------------------------------------------------
    function drawFace(f, fill, outer, inner) {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();

        ctx.strokeStyle = inner;
        ctx.lineWidth = 1;

        for (let i = 1; i < f.w; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * UNIT, y);
            ctx.lineTo(x + i * UNIT, y + h);
            ctx.stroke();
        }
        for (let i = 1; i < f.h; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + i * UNIT);
            ctx.lineTo(x + w, y + i * UNIT);
            ctx.stroke();
        }

        ctx.strokeStyle = outer;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    // -----------------------------------------------------
    // 굵은 대각선 빗금 (오답 시 사용)
    // -----------------------------------------------------
    function drawHatchetFace(f) {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 5;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();

        ctx.restore();
    }

    UI.drawHatchetFace = drawHatchetFace;

    // -----------------------------------------------------
    // 검출을 위한 outline
    // -----------------------------------------------------
    function drawFaceOutline(f, color, lw = 3, fill = "transparent") {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.rect(x, y, f.w * UNIT, f.h * UNIT);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // -----------------------------------------------------
    // 중심 보정
    // -----------------------------------------------------
    function calculateCenterOffset(net, removed, placed, buildMode) {
        let minU = Infinity,
            maxU = -Infinity,
            minV = Infinity,
            maxV = -Infinity;

        const faces = net.faces;

        for (const f of faces) {
            if (f.id === removed) continue;
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }

        if (buildMode && placed) {
            minU = Math.min(minU, placed.u);
            maxU = Math.max(maxU, placed.u + placed.w);
            minV = Math.min(minV, placed.v);
            maxV = Math.max(maxV, placed.v + placed.h);
        }

        const w = maxU - minU;
        const h = maxV - minV;

        U_OFFSET = Math.round((canvas.width / UNIT - w) / 2 - minU);
        V_OFFSET = Math.round((canvas.height / UNIT - h) / 2 - minV);
    }

    // -----------------------------------------------------
    // 후보 위치 계산
    // -----------------------------------------------------
    function pickRemovableFace(net) {
        return net.faces[0].id;
    }

    function computeCandidatePositions(net) {
        const removed = net.faces.find(f => f.id === removedFaceId);
        const rest = net.faces.filter(f => f.id !== removedFaceId);

        candidatePositions = [];

        for (const p of rest) {
            const pos = [
                { u: p.u, v: p.v - removed.h },
                { u: p.u + p.w, v: p.v },
                { u: p.u, v: p.v + p.h },
                { u: p.u - removed.w, v: p.v }
            ];

            pos.forEach(q => {
                if (!candidatePositions.find(c => c.u === q.u && c.v === q.v)) {
                    candidatePositions.push({ ...q, w: removed.w, h: removed.h });
                }
            });
        }
    }

    function isPositionOccupied(pos) {
        for (const f of currentNet.faces) {
            if (
                f.id !== removedFaceId &&
                Math.abs(f.u - pos.u) < EPS &&
                Math.abs(f.v - pos.v) < EPS
            ) {
                return true;
            }
        }
        return false;
    }

    // -----------------------------------------------------
    // 클릭 이벤트
    // -----------------------------------------------------
    function onCanvasClick(evt) {
        if (!currentNet) return;

        const rect = canvas.getBoundingClientRect();
        const u = evt.offsetX / UNIT - U_OFFSET;
        const v = evt.offsetY / UNIT - V_OFFSET;

        if (
            window.CubeProject.currentProblem.mode ===
            window.CubeProject.MAIN_MODE.NET_BUILD
        ) {
            for (const pos of candidatePositions) {
                if (
                    u >= pos.u &&
                    u < pos.u + pos.w &&
                    v >= pos.v &&
                    v < pos.v + pos.h
                ) {
                    if (isPositionOccupied(pos)) return;

                    UI.placed = pos;
                    UI.renderNet(currentNet, { highlightPositions: true });
                    return;
                }
            }
        }
    }

    // -----------------------------------------------------
    // 정답 체크 요청
    // -----------------------------------------------------
    UI.checkPieceResult = function (net) {
        if (!net || net.faces.length !== 6) return false;
        return Validator.validateNet(net);
    };
})();
