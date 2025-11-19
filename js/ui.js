/**
 * ui.js – Cube 전개도 (정육면체 전용)
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
    let candidatePositions = [];     // {u, v, w, h}
    UI.placed = null;                // 학생이 놓은 조각 위치

    const UNIT = 60;                 // 한 칸 크기(px)
    const EPS = 1e-6;

    // 2D 전개도용 면 색 (id 0~5 기준)
    const FACE_COLORS = [
        "#ff6666", // 빨
        "#ffd43b", // 노
        "#69db7c", // 초
        "#4dabf7", // 파
        "#9775fa", // 보
        "#f783ac"  // 분홍
    ];

    // 중앙 정렬 offset
    let U_OFFSET = 0;
    let V_OFFSET = 0;

    // ------------------------------------------------
    // 초기화 / 클리어
    // ------------------------------------------------
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

    // ------------------------------------------------
    // 전개도 렌더링
    // ------------------------------------------------
    UI.renderNet = function (net, options = {}) {
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = JSON.parse(JSON.stringify(net));

        const isNetBuildMode =
            window.CubeProject &&
            window.CubeProject.currentProblem &&
            window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD;

        // 전개도 완성 모드일 때만 제거 면/후보 위치 계산
        if (isNetBuildMode) {
            if (removedFaceId == null) {
                removedFaceId = pickRemovableFace(currentNet);
            }
            computeCandidatePositions(currentNet);
        }

        // placed는 중심 계산에서 제외 → 클릭해도 전개도 위치 안 바뀜
        calculateCenterOffset(currentNet, removedFaceId, isNetBuildMode);
        drawGrid();

        // 겹침 문제: 선택된 점/선 하이라이트
        if (!isNetBuildMode) {
            if (window.Overlap && window.Overlap.getSelections) {
                const sel = window.Overlap.getSelections();
                if (sel.first) drawOverlapElement(sel.first, "#ffd966");
                if (sel.second) drawOverlapElement(sel.second, "#ffc107");
            }
        }

        // 1) 후보 위치 (가장 아래 레이어)
        if (isNetBuildMode && options.highlightPositions) {
            for (const c of candidatePositions) {
                if (!isPositionOccupied(c)) {
                    drawFaceOutline(c, "#ddd", 1, "#f9f9f9");
                }
            }
        }

        // 2) 원래 전개도 면들 (색 포함)
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                drawFace(f);
            }
        }

        // 3) 학생이 배치한 조각
        if (UI.placed) {
            drawFaceOutline(UI.placed, "#ff8800", 5, "rgba(255,200,0,0.15)");
        }

        // 캔버스 외곽 테두리
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };

    // ------------------------------------------------
    // 중심 정렬 계산
    //   - removedFace 제외
    //   - candidatePositions 포함 (항상 보이도록)
    //   - placed 는 포함하지 않음 → 클릭해도 전개도 안 흔들림
    // ------------------------------------------------
    function calculateCenterOffset(net, removedId, isNetBuildMode) {
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

        const netWidth = maxU - minU;
        const netHeight = maxV - minV;

        const canvasSize = canvas.width; // 정사각형 캔버스 가정

        U_OFFSET = (canvasSize / UNIT - netWidth) / 2 - minU;
        V_OFFSET = (canvasSize / UNIT - netHeight) / 2 - minV;

        U_OFFSET = Math.round(U_OFFSET);
        V_OFFSET = Math.round(V_OFFSET);
    }

    // ------------------------------------------------
    // 모눈 전체
    // ------------------------------------------------
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

    // ------------------------------------------------
    // 면 그리기 (색 포함)
    // ------------------------------------------------
    function drawFace(f, fill, outerStroke = "#333", innerStroke = "#888") {
        const x = (f.u + U_OFFSET) * UNIT;
        const y = (f.v + V_OFFSET) * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        // face.id 기준 색 선택
        const colorIndex = (typeof f.id === "number")
            ? (f.id % FACE_COLORS.length)
            : 0;
        const baseFill = f.color || FACE_COLORS[colorIndex];

        const finalFill = fill || baseFill;

        ctx.save();
        ctx.fillStyle = finalFill;

        // 1) 면 전체
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();

        // 2) 내부 격자선
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

        // 3) 외곽 테두리
        ctx.strokeStyle = outerStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.stroke();

        ctx.restore();
    }

    // 테두리만
    function drawFaceOutline(f, color, lineWidth = 3, fillColor = "transparent") {
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

    // ------------------------------------------------
    // 겹침 문제용 하이라이트 (점/선)
    // ------------------------------------------------
    function drawOverlapElement(elem, color) {
        if (!elem || !currentNet) return;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;

        const face = currentNet.faces.find(f => f.id === elem.face);
        if (!face) return;

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
            ctx.lineCap = "round";
            ctx.stroke();
        }
        ctx.restore();
    }

    // ------------------------------------------------
    // removable face (잎) 선택 – leaf id
    // ------------------------------------------------
    function pickRemovableFace(net) {
        const adj = buildAdjacency(net);
        // 연결 차수가 1인 face를 우선 제거 대상으로 선택
        for (let i = 0; i < 6; i++) {
            if (adj[i] && adj[i].length === 1) return i;
        }
        // 없으면 0번 face
        return 0;
    }

    // main.js에서 사용하는 getter
    UI.getRemovedFaceId = function () {
        return removedFaceId;
    };

    // ------------------------------------------------
    // adjacency 계산 (id 기준)
    // ------------------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);
        const faces = net.faces;

        for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
                const fi = faces[i];
                const fj = faces[j];

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
        return [
            { a:[f.u,         f.v        ], b:[f.u + f.w, f.v        ] }, // top
            { a:[f.u + f.w,   f.v        ], b:[f.u + f.w, f.v + f.h ] }, // right
            { a:[f.u + f.w,   f.v + f.h ], b:[f.u,       f.v + f.h ] }, // bottom
            { a:[f.u,         f.v + f.h ], b:[f.u,       f.v        ] }  // left
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
        return Math.sqrt(dx*dx + dy*dy);
    }

    // ------------------------------------------------
    // 학생이 놓을 수 있는 후보 위치 계산
    // ------------------------------------------------
    function computeCandidatePositions(net) {
        candidatePositions = [];

        const removedFace = net.faces.find(f => f.id === removedFaceId);
        if (!removedFace) return;

        const activeFaces = net.faces.filter(f => f.id !== removedFaceId);

        for (const parent of activeFaces) {
            const edgesF = getEdges(parent);
            const edgesR = getEdges(removedFace);

            for (let eP = 0; eP < 4; eP++) {
                for (let eR = 0; eR < 4; eR++) {
                    const lenP = edgeLength(edgesF[eP]);
                    const lenR = edgeLength(edgesR[eR]);

                    if (Math.abs(lenP - lenR) > EPS) continue;

                    const pos = computePlacementByAttachment(parent, removedFace, eP);
                    if (!pos) continue;

                    const dup = candidatePositions.some(c =>
                        Math.abs(c.u - pos.u) < EPS &&
                        Math.abs(c.v - pos.v) < EPS &&
                        Math.abs(c.w - pos.w) < EPS &&
                        Math.abs(c.h - pos.h) < EPS
                    );
                    if (!dup) candidatePositions.push(pos);
                }
            }
        }
    }

    function computePlacementByAttachment(parent, removed, eP) {
        let ru, rv;
        switch (eP) {
            case 0: // 위
                ru = parent.u;
                rv = parent.v - removed.h;
                break;
            case 1: // 오른쪽
                ru = parent.u + parent.w;
                rv = parent.v;
                break;
            case 2: // 아래
                ru = parent.u;
                rv = parent.v + parent.h;
                break;
            case 3: // 왼쪽
                ru = parent.u - removed.w;
                rv = parent.v;
                break;
            default:
                return null;
        }
        return { u: ru, v: rv, w: removed.w, h: removed.h };
    }

    function isPositionOccupied(pos) {
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId &&
                Math.abs(f.u - pos.u) < EPS &&
                Math.abs(f.v - pos.v) < EPS &&
                Math.abs(f.w - pos.w) < EPS &&
                Math.abs(f.h - pos.h) < EPS) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------
    // 캔버스 클릭 처리
    // ------------------------------------------------
    function onCanvasClick(evt) {
        if (!canvas || !currentNet || !window.CubeProject || !window.CubeProject.currentProblem) return;

        const rect = canvas.getBoundingClientRect();
        const x = (evt.clientX - rect.left);
        const y = (evt.clientY - rect.top);

        const u = x / UNIT - U_OFFSET;
        const v = y / UNIT - V_OFFSET;

        const mode = window.CubeProject.currentProblem.mode;

        // 전개도 완성하기
        if (mode === window.CubeProject.MAIN_MODE.NET_BUILD) {
            if (removedFaceId == null) return;

            for (const pos of candidatePositions) {
                if (u >= pos.u && u < pos.u + pos.w &&
                    v >= pos.v && v < pos.v + pos.h) {

                    if (isPositionOccupied(pos)) return;

                    UI.placed = pos;
                    UI.renderNet(currentNet, { highlightPositions: true });
                    return;
                }
            }
        }
        // 겹침 찾기
        else if (mode === window.CubeProject.MAIN_MODE.OVERLAP_FIND) {
            if (window.Overlap && typeof window.Overlap.recordClick === "function") {
                const result = window.Overlap.recordClick(u, v);
                if (result) {
                    UI.renderNet(currentNet, {});
                }
            }
        }
    }

    // ------------------------------------------------
    // 정답 판정 – Validator / Overlap 연결
    // ------------------------------------------------
    UI.checkPieceResult = function (net) {
        if (!net || !net.faces || net.faces.length !== 6) {
            if (window.Validator) {
                window.Validator.lastError = "검증을 위한 6조각 전개도가 준비되지 않았습니다.";
            }
            return false;
        }
        if (!window.Validator || typeof window.Validator.validateNet !== "function") {
            return false;
        }
        return window.Validator.validateNet(net);
    };

    UI.checkOverlapResult = function (net) {
        if (!window.Overlap || typeof window.Overlap.checkUserAnswer !== "function") {
            return false;
        }
        return window.Overlap.checkUserAnswer(net);
    };

})();
