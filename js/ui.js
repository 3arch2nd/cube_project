/**
 * ui.js – Cube + Rectangular Prism 전개도 완전 지원 버전
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
    let candidatePositions = [];     // {u,v, edgeIndexParent, edgeIndexRemoved}
    let placed = null;

    const UNIT = 60; // 한 칸 크기

    // --------------------------------------
    // 초기화
    // --------------------------------------
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");

        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
    };

    // --------------------------------------
    // net 렌더링 (w×h 지원)
    // --------------------------------------
    UI.renderNet = function (net, options = {}) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = JSON.parse(JSON.stringify(net));

        if (options.removeOne) {
            if (removedFaceId == null) removedFaceId = pickRemovableFace(net);
            computeCandidatePositions(currentNet);
        }

        for (const f of currentNet.faces) {
            drawFace(f, f.id === removedFaceId ? "#ffffff" : "#eaeaea");
        }

        if (options.highlightPositions) {
            for (const c of candidatePositions) {
                drawFaceOutline(c, "#8fce00");
            }
        }

        if (placed) {
            drawFaceOutline(placed, "#ffd966");
        }
    };

    // --------------------------------------
    // face 그리기 – w×h 지원
    // --------------------------------------
    function drawFace(f, fill) {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // outline만
    function drawFaceOutline(f, color) {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.stroke();
        ctx.restore();
    }

    // --------------------------------------
    // 제거할 face 선택 (leaf face 기준)
    // --------------------------------------
    function pickRemovableFace(net) {
        // adjacency 계산
        const adj = buildAdjacency(net);

        // degree=1인 face가 leaf
        for (let i = 0; i < 6; i++) {
            if (adj[i].length === 1) return i;
        }
        return 0; // fallback
    }

    // --------------------------------------
    // adjacency (정육면체+직육면체 대응)
    // --------------------------------------
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
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // left
        ];
    }

    function sameEdge(e1, e2) {
        return (
            e1.a[0] === e2.b[0] &&
            e1.a[1] === e2.b[1] &&
            e1.b[0] === e2.a[0] &&
            e1.b[1] === e2.a[1]
        );
    }

    // --------------------------------------
    // candidatePositions 계산 (edge 기반)
    // --------------------------------------
    function computeCandidatePositions(net) {
        candidatePositions = [];

        const removedFace = net.faces.find(f => f.id === removedFaceId);
        const otherFaces = net.faces.filter(f => f.id !== removedFaceId);

        const edgesR = getEdges(removedFace);

        for (const f of otherFaces) {
            const edgesF = getEdges(f);

            for (let eF = 0; eF < 4; eF++) {
                for (let eR = 0; eR < 4; eR++) {

                    if (edgesF[eF].b[0] === edgesR[eR].a[0] &&
                        edgesF[eF].b[1] === edgesR[eR].a[1] &&
                        edgesF[eF].a[0] === edgesR[eR].b[0] &&
                        edgesF[eF].a[1] === edgesR[eR].b[1]) {

                        const pos = computeRemovedPlacement(f, removedFace, eF, eR);
                        if (pos) candidatePositions.push(pos);
                    }
                }
            }
        }
    }

    // --------------------------------------
    // 실제 배치 좌표 계산
    // --------------------------------------
    function computeRemovedPlacement(parent, removed, eP, eR) {
        const { u, v, w, h } = parent;

        let ru = parent.u;
        let rv = parent.v;

        switch (eP) {
            case 0: rv = parent.v - removed.h; ru = parent.u; break;
            case 1: ru = parent.u + parent.w; rv = parent.v; break;
            case 2: rv = parent.v + parent.h; ru = parent.u; break;
            case 3: ru = parent.u - removed.w; rv = parent.v; break;
            default: return null;
        }
        return { 
            u: ru, 
            v: rv, 
            w: removed.w, 
            h: removed.h 
        };
    }

    // --------------------------------------
    // 클릭 → placed 적용
    // --------------------------------------
    function onCanvasClick(evt) {
        if (!currentNet || removedFaceId == null) return;

        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        const u = x / UNIT;
        const v = y / UNIT;

        for (const pos of candidatePositions) {
            if (
                u >= pos.u && u <= pos.u + pos.w &&
                v >= pos.v && v <= pos.v + pos.h
            ) {
                placed = pos;
                UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                return;
            }
        }
    }

    // --------------------------------------
    // 정답 판정 (validator 연결)
    // --------------------------------------
    UI.checkPieceResult = function (net) {
        if (!placed) return false;

        const f = net.faces.find(f => f.id === removedFaceId);
        f.u = placed.u;
        f.v = placed.v;

        return Validator.validateNet(net);
    };

    // overlap 모드는 Overlap.js에서 처리
    UI.checkOverlapResult = function (net) {
        return Overlap.checkUserAnswer(net);
    };

})();
