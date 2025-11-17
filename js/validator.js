/**
 * validator.js
 *
 * 정답 판정 엔진
 *
 * 포함 기능:
 *   1) 전개도가 정육면체 전개도(11종)인지 판정
 *   2) Three.js에서 접힌 뒤 face들의 월드 좌표를 얻어
 *      실제로 정육면체인지 검사
 *   3) 겹치는 점/선 문제에서 “겹침 여부” 계산
 *
 * 외부에서 사용하는 주요 함수:
 *
 *   Validator.isValidCubeNet(net)
 *   Validator.extractCubeGeometry(faceGroups)
 *   Validator.checkCubeGeometry(geom)
 *   Validator.checkOverlap(pointA, pointB)
 */

(function () {
    'use strict';

    const Validator = {};
    window.Validator = Validator;

    const EPS = 0.0005;  // 비교용 허용 오차

    // -----------------------------------------------------
    // 1) 전개도가 정육면체 전개도인지 확인
    // -----------------------------------------------------
    Validator.isValidCubeNet = function (net) {
        // net.faces: [{id,u,v}, ...]
        // CubeNets.normalizeNet 기반으로 정규화하여 비교
        const key = CubeNets.normalizeNet(net);
        return CubeNets.nets.some(n => n.normalizeKey === key);
    };

    // -----------------------------------------------------
    // 2) Three.js에서 접힌 뒤 각 face의 월드 좌표 추출
    //
    //   faceGroups: FoldEngine에서 만든 6개의 그룹
    //
    //   반환 구조:
    //   {
    //      centers: [THREE.Vector3, ...],  // 면 중심들
    //      normals: [THREE.Vector3, ...],  // 면 법선 벡터들
    //      corners: [[Vector3,Vector3,Vector3,Vector3], ...]  // 네 꼭짓점
    //   }
    // -----------------------------------------------------
    Validator.extractCubeGeometry = function (faceGroups) {
        const centers = [];
        const normals = [];
        const corners = [];

        const tmpVector = new THREE.Vector3();
        const tmpMatrix = new THREE.Matrix4();

        for (let i = 0; i < faceGroups.length; i++) {
            const grp = faceGroups[i];

            // 월드 행렬
            grp.updateWorldMatrix(true, false);
            const wMat = grp.matrixWorld;

            // 중심점(0,0,0)을 세계 좌표로 변환
            const center = new THREE.Vector3(0, 0, 0).applyMatrix4(wMat);
            centers.push(center);

            // 법선(0,0,1)을 세계 좌표로 변환
            const normal = new THREE.Vector3(0, 0, 1).applyMatrix4(wMat)
                .sub(center)
                .normalize();
            normals.push(normal);

            // 네 꼭짓점
            const cs = [];
            const pts = [
                [-0.5, -0.5, 0],
                [ 0.5, -0.5, 0],
                [ 0.5,  0.5, 0],
                [-0.5,  0.5, 0],
            ];
            for (const p of pts) {
                const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(wMat);
                cs.push(v);
            }
            corners.push(cs);
        }

        return { centers, normals, corners };
    };

    // -----------------------------------------------------
    // 3) 실제로 정육면체인지 검사
    //    - 6개 면 중심이 모두 "±0.5 offset cube" 패턴인지
    //    - 법선끼리 90°인지
    //
    //    단, 변형된 큐브(확대/축소)는 허용
    //    => 중심 패턴만 맞춰도 됨
    // -----------------------------------------------------
    Validator.checkCubeGeometry = function (geom) {
        const centers = geom.centers;

        // 중심이 6개인지 확인
        if (centers.length !== 6) return false;

        // 중심 좌표를 배열로
        const arr = centers.map(c => [c.x, c.y, c.z]);

        // 정육면체의 6개 face 중심은 다음 패턴 중 하나:
        //   (±s, 0, 0), (0, ±s, 0), (0, 0, ±s)
        //
        // 여기서 s는 일정한 양수(정확히 0.5일 필요는 없음)
        // → s를 추정한 뒤 비교
        //
        // 1) 절댓값을 모아서 s 후보 찾기
        const mags = arr.map(a => Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])));
        const s = average(mags);

        function isClose(a, b) {
            return Math.abs(a - b) < 0.05;
        }

        // 2) 모든 중심이 (±s,0,0) / (0,±s,0) / (0,0,±s) 중 하나인지 검사
        let validCount = 0;
        arr.forEach(([x, y, z]) => {
            const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);

            const caseX = isClose(ax, s) && isClose(ay, 0) && isClose(az, 0);
            const caseY = isClose(ax, 0) && isClose(ay, s) && isClose(az, 0);
            const caseZ = isClose(ax, 0) && isClose(ay, 0) && isClose(az, s);

            if (caseX || caseY || caseZ) validCount++;
        });

        return validCount === 6;
    };

    // -----------------------------------------------------
    // 4) 겹치는 점/선 판정
    //
    //   (A, B) 두 개의 점 좌표가 같으면 겹침
    //   선의 경우는 네 점이 모두 매칭되면 겹침
    // -----------------------------------------------------
    Validator.checkOverlap = function (geom, A, B) {
        // A, B: { faceId, localIndex }  (점/꼭짓점)
        // localIndex: 0~3

        const cornerA = geom.corners[A.faceId][A.localIndex];
        const cornerB = geom.corners[B.faceId][B.localIndex];

        if (cornerA.distanceTo(cornerB) < EPS) return true;
        return false;
    };

    // -----------------------------------------------------
    // 작은 유틸
    // -----------------------------------------------------
    function average(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

})();
