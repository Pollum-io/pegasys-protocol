import chai, { expect } from 'chai'
import { Contract, constants, utils, BigNumber } from 'ethers'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import BalanceTree from '../utils/balance-tree'
import Distributor from '../artifacts/contracts/earn/MerkleAirdrop.sol/MerkleAirdrop.json'
import TestERC20 from '../artifacts/contracts/MOCK/MockERC20.sol/Token.json'
import { parseBalanceMap } from '../utils/parse-balance-map'

chai.use(solidity)

describe('MerkleAirdrop', () => {
    const provider = new MockProvider({
        ganacheOptions: {
            hardfork: 'istanbul',
            mnemonic: 'gauge gauge gauge gauge gauge gauge gauge gauge gauge gauge gauge gauge',
            gasLimit: 9999999,
        },
    })

    const wallets = provider.getWallets()
    const [tokenOwner, wallet0, wallet1] = wallets

    const overrides = {
        gasLimit: 9999999,
    }
    const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'


    let token: Contract
    beforeEach('deploy token', async () => {
        token = await deployContract(tokenOwner, TestERC20, [])
    })

    describe('#token', () => {
        it('returns the token address', async () => {
            const distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, ZERO_BYTES32])
            expect(await distributor.token()).to.eq(token.address)
        })
    })

    describe('#merkleRoot', () => {
        it('returns the zero merkle root', async () => {
            const distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, ZERO_BYTES32])
            expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32)
        })
    })
    describe('#claim', () => {
        it('fails for empty proof', async () => {
            const distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, ZERO_BYTES32])
            await expect(distributor.claim(0, wallet0.address, 10, [])).to.be.revertedWith(
                'MerkleAirdrop: Valid proof required.'
            )
        })

        it('fails for invalid index', async () => {
            const distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, ZERO_BYTES32])
            await expect(distributor.claim(0, wallet0.address, 10, [])).to.be.revertedWith(
                'MerkleAirdrop: Valid proof required.'
            )
        })
        describe('two account tree', () => {
            let distributor: Contract
            let tree: BalanceTree
            beforeEach('deploy', async () => {
                tree = new BalanceTree([
                    { account: wallet0.address, amount: BigNumber.from(100) },
                    { account: wallet1.address, amount: BigNumber.from(101) },
                ])
                distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, tree.getHexRoot()])
                await token.approve(distributor.address, BigNumber.from(201))
            })
            it('successful claim', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))

                await expect(distributor.claim(0, wallet0.address, 100, proof0, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(0, wallet0.address, 100)
                const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
                await expect(distributor.claim(1, wallet1.address, 101, proof1))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(1, wallet1.address, 101)
            })
            it('transfers the token', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                expect(await token.balanceOf(wallet1.address)).to.eq(0)
                await distributor.claim(0, wallet0.address, 100, proof0, overrides)
                expect(await token.balanceOf(wallet0.address)).to.eq(100)
            })

            it('must have enough to transfer', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                await token.approve(distributor.address, 99)
                await expect(distributor.claim(0, wallet0.address, 100, proof0,)).to.be.reverted
            })

            it('sets #isClaimed', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                expect(await distributor.isClaimed(0)).to.eq(false)
                expect(await distributor.isClaimed(1)).to.eq(false)
                await distributor.claim(0, wallet0.address, 100, proof0, overrides)
                expect(await distributor.isClaimed(0)).to.eq(true)
                expect(await distributor.isClaimed(1)).to.eq(false)
            })
            it('cannot allow two claims', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                await distributor.claim(0, wallet0.address, 100, proof0, overrides)
                await expect(distributor.claim(0, wallet0.address, 100, proof0, overrides)).to.be.revertedWith(
                    'MerkleAirdrop: Tokens already claimed.'
                )
            })

            it('cannot claim more than once: 0 and then 1', async () => {
                await distributor.claim(
                    0,
                    wallet0.address,
                    100,
                    tree.getProof(0, wallet0.address, BigNumber.from(100)),
                    overrides
                )
                await distributor.claim(
                    1,
                    wallet1.address,
                    101,
                    tree.getProof(1, wallet1.address, BigNumber.from(101)),
                    overrides
                )

                await expect(
                    distributor.claim(0, wallet0.address, 100, tree.getProof(0, wallet0.address, BigNumber.from(100)), overrides)
                ).to.be.revertedWith('MerkleAirdrop: Tokens already claimed.')
            })

            it('cannot claim more than once: 1 and then 0', async () => {
                await distributor.claim(
                    1,
                    wallet1.address,
                    101,
                    tree.getProof(1, wallet1.address, BigNumber.from(101)),
                    overrides
                )
                await distributor.claim(
                    0,
                    wallet0.address,
                    100,
                    tree.getProof(0, wallet0.address, BigNumber.from(100)),
                    overrides
                )

                await expect(
                    distributor.claim(1, wallet1.address, 101, tree.getProof(1, wallet1.address, BigNumber.from(101)), overrides)
                ).to.be.revertedWith('MerkleAirdrop: Tokens already claimed.')
            })

            it('cannot claim for address other than proof', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                await expect(distributor.claim(1, wallet1.address, 101, proof0, overrides)).to.be.revertedWith(
                    'MerkleAirdrop: Valid proof required.'
                )
            })

            it('cannot claim more than proof', async () => {
                const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
                await expect(distributor.claim(0, wallet0.address, 101, proof0, overrides)).to.be.revertedWith(
                    'MerkleAirdrop: Valid proof required.'
                )
            })

            it('gas', async () => {
                const proof = tree.getProof(0, wallet0.address, BigNumber.from(100))
                const tx = await distributor.claim(0, wallet0.address, 100, proof, overrides)
                const receipt = await tx.wait()
                expect(receipt.gasUsed).to.eq(89775)
            })
        })
    })
    describe('larger tree', () => {
        let distributor: Contract
        let tree: BalanceTree
        beforeEach('deploy', async () => {
            tree = new BalanceTree(
                wallets.map((wallet, ix) => {
                    return { account: wallet.address, amount: BigNumber.from(ix + 1) }
                })
            )
            distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, tree.getHexRoot()], overrides)
            await token.approve(distributor.address, 201)
        })

        it('claim index 4', async () => {
            const proof = tree.getProof(4, wallets[4].address, BigNumber.from(5))
            await expect(distributor.claim(4, wallets[4].address, 5, proof, overrides))
                .to.emit(distributor, 'Claimed')
                .withArgs(4, wallets[4].address, 5)
        })

        it('claim index 9', async () => {
            const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
            await expect(distributor.claim(9, wallets[9].address, 10, proof, overrides))
                .to.emit(distributor, 'Claimed')
                .withArgs(9, wallets[9].address, 10)
        })

        it('gas', async () => {
            const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
            const tx = await distributor.claim(9, wallets[9].address, 10, proof, overrides)
            const receipt = await tx.wait()
            expect(receipt.gasUsed).to.eq(92532)
        })

        it('gas second down about 15k', async () => {
            await distributor.claim(
                0,
                wallets[0].address,
                1,
                tree.getProof(0, wallets[0].address, BigNumber.from(1)),
                overrides
            )
            const tx = await distributor.claim(
                1,
                wallets[1].address,
                2,
                tree.getProof(1, wallets[1].address, BigNumber.from(2)),
                overrides
            )
            const receipt = await tx.wait()
            expect(receipt.gasUsed).to.eq(77512)
        })
    })
    describe('realistic size tree', () => {
        let distributor: Contract
        let tree: BalanceTree
        const NUM_LEAVES = 100_000
        const NUM_SAMPLES = 25
        const elements: { account: string; amount: BigNumber }[] = []
        for (let i = 0; i < NUM_LEAVES; i++) {
            const node = { account: wallet0.address, amount: BigNumber.from(100) }
            elements.push(node)
        }
        tree = new BalanceTree(elements)

        it('proof verification works', () => {
            const root = Buffer.from(tree.getHexRoot().slice(2), 'hex')
            for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
                const proof = tree
                    .getProof(i, wallet0.address, BigNumber.from(100))
                    .map((el) => Buffer.from(el.slice(2), 'hex'))
                const validProof = BalanceTree.verifyProof(i, wallet0.address, BigNumber.from(100), proof, root)
                expect(validProof).to.be.true
            }
        })

        beforeEach('deploy', async () => {
            distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, tree.getHexRoot()], overrides)
            await token.approve(distributor.address, constants.MaxUint256)
        })

        it('gas', async () => {
            const proof = tree.getProof(50000, wallet0.address, BigNumber.from(100))
            const tx = await distributor.claim(50000, wallet0.address, 100, proof, overrides)
            const receipt = await tx.wait()
            expect(receipt.gasUsed).to.eq(104318)
        })
        it('gas deeper node', async () => {
            const proof = tree.getProof(90000, wallet0.address, BigNumber.from(100))
            const tx = await distributor.claim(90000, wallet0.address, 100, proof, overrides)
            const receipt = await tx.wait()
            expect(receipt.gasUsed).to.eq(104346)
        })
        it('gas average random distribution', async () => {
            let total: BigNumber = BigNumber.from(0)
            let count: number = 0
            for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
                const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
                const tx = await distributor.claim(i, wallet0.address, 100, proof, overrides)
                const receipt = await tx.wait()
                total = total.add(receipt.gasUsed)
                count++
            }
            const average = total.div(count)
            expect(average).to.eq(89934)
        })
        // this is what we gas golfed by packing the bitmap
        it('gas average first 25', async () => {
            let total: BigNumber = BigNumber.from(0)
            let count: number = 0
            for (let i = 0; i < 25; i++) {
                const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
                const tx = await distributor.claim(i, wallet0.address, 100, proof, overrides)
                const receipt = await tx.wait()
                total = total.add(receipt.gasUsed)
                count++
            }
            const average = total.div(count)
            expect(average).to.eq(75375)
        })

        it('no double claims in random distribution', async () => {
            for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
                const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
                await distributor.claim(i, wallet0.address, 100, proof, overrides)
                await expect(distributor.claim(i, wallet0.address, 100, proof, overrides)).to.be.revertedWith(
                    'MerkleAirdrop: Tokens already claimed.'
                )
            }
        })
    })
    describe('parseBalanceMap', () => {
        let distributor: Contract
        let claims: {
            [account: string]: {
                index: number
                amount: string
                proof: string[]
            }
        }
        beforeEach('deploy', async () => {
            const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
                [wallet0.address]: 200,
                [wallet1.address]: 300,
                [wallets[3].address]: 250,
            })
            expect(tokenTotal).to.eq('0x02ee') // 750
            claims = innerClaims
            distributor = await deployContract(tokenOwner, Distributor, [tokenOwner.address, token.address, merkleRoot], overrides)
            await token.approve(distributor.address, tokenTotal)
        })

        it('check the proofs is as expected', () => {
            expect(claims).to.deep.eq({
                [wallet0.address]: {
                    index: 0,
                    amount: '0xc8',
                    proof: ['0x37f1eecbb331583927abb67ce8f3e0d4812997e66ac54af1ff8cebe70e2f9c25'],
                },
                [wallet1.address]: {
                    index: 1,
                    amount: '0x012c',
                    proof: [
                        '0x10a78883299e3da69bbaa0389b5e9263c3f2e9116fd8821ab5e0e5be3e713888',
                        '0xeb5ab017da0d822312c8f4e90151af40a8ee2825c5da915a7fa0b1cc8772572a',
                    ],
                },
                [wallets[3].address]: {
                    index: 2,
                    amount: '0xfa',
                    proof: [
                        '0xad70a5ede6b3afcbd9521e9ecf2c8e077e08a062ab00e48da724c09a02e19a4a',
                        '0xeb5ab017da0d822312c8f4e90151af40a8ee2825c5da915a7fa0b1cc8772572a',
                    ],
                },
            })
        })

        it('all claims work exactly once', async () => {
            for (let account in claims) {
                const claim = claims[account]
                await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides))
                    .to.emit(distributor, 'Claimed')
                    .withArgs(claim.index, account, claim.amount)
                await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides)).to.be.revertedWith(
                    'MerkleAirdrop: Tokens already claimed.'
                )
            }
            expect(await token.balanceOf(distributor.address)).to.eq(0)
        })
    })
})