/**
 * validator.js – 정육면체 전개도 검증(정답 판정)
 *
 * 핵심 아이디어:
 *  - 학생이 만든 전개도(net)의 6칸 좌표를
 *  - CubeNets의 11개 전개도 normalizeKey 와 비교
 *  - 회전/대칭을 모두 허용한 동일 형태이면 "정답"
 *  - 그 외 (겹침, 구멍, 이상한 모양)는 모두 오답
 *
 * → FoldEngine으로 애니메이션은 보여주되,
 *    채점은 이 정규화 키 기반으로 100% 안정적으로 처리.
 */

(function () {
    'use strict';

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";

    function fail(msg) {
        Validator.lastError = msg;
        return false;
    }

    Validator.validateNet = function (net) {
        Validator.lastError = "";

        if (!net || !Array.isArray(net.faces)) {
            return fail("전개도 데이터가 올바르지 않습니다.");
        }

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        if (faces.length !== 6) {
            return fail(`전개도는 반드시 6개의 정사각형 면으로 구성되어야 합니다. (현재 ${faces.length}개)`);
        }

        // 좌표 중복(겹침) 검사
        const coordSet = new Set();
        for (const f of faces) {
            if (f.w !== 1 || f.h !== 1) {
                return fail("정육면체 전개도는 모든 면이 1×1 정사각형이어야 합니다.");
            }
            const key = `${f.u},${f.v}`;
            if (coordSet.has(key)) {
                return fail("서로 겹치는 면이 있습니다.");
            }
            coordSet.add(key);
        }

        if (!window.CubeNets || !Array.isArray(window.CubeNets.nets)) {
            return fail("기준 전개도(CubeNets)가 준비되지 않았습니다.");
        }

        // 현재 net의 정규화 키 계산 (CubeNets.normalizeNet 재사용)
        const tempNet = {
            faces: faces.map(f => ({ u: f.u, v: f.v }))
        };

        // CubeNets.normalizeNet은 faces에 id가 없어도 u,v만 사용
        const normalizedKey = window.CubeNets.normalizeNet({
            faces: faces.map(f => ({ u: f.u, v: f.v }))
        });

        const anyMatch = window.CubeNets.nets.some(base => base.normalizeKey === normalizedKey);

        if (!anyMatch) {
            return fail("정육면체로 접을 수 없는 전개도입니다.");
        }

        // 여기까지 통과하면 "정확히 11개 패턴 중 하나"인 올바른 전개도
        return true;
    };

})();
