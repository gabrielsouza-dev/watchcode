/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatUnviewedBatches } from '../../common/timelineBadge.js';

suite('watchCode timelineBadge', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('sem lote novo o titulo fica sem descricao', () => {
		assert.deepStrictEqual([formatUnviewedBatches(0), formatUnviewedBatches(-1)], ['', '']);
	});

	test('um lote novo sai no singular', () => {
		assert.strictEqual(formatUnviewedBatches(1), '1 new batch');
	});

	test('varios lotes saem no plural', () => {
		assert.strictEqual(formatUnviewedBatches(3), '3 new batches');
	});
});
