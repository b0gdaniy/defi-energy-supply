// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Main } from "../../contracts/Main.sol";
import { Register } from "../../contracts/Register.sol";
import { EnergyOracle } from "../../contracts/EnergyOracle.sol";
import { Escrow } from "../../contracts/Escrow.sol";
import { StakingReward } from "../../contracts/StakingReward.sol";
import { ERC20TokenBase } from "../../contracts/tokens/base/ERC20TokenBase.sol";
import { ERC721TokenBase } from "../../contracts/tokens/base/ERC721TokenBase.sol";
import { EnergyCreditToken } from "../../contracts/tokens/ERC20/EnergyCreditToken.sol";
import { MicrogridGovernanceToken } from "../../contracts/tokens/ERC20/MicrogridGovernanceToken.sol";
import { EnergyProducerToken } from "../../contracts/tokens/ERC712/EnergyProducerToken.sol";
import { EnergySupplierToken } from "../../contracts/tokens/ERC712/EnergySupplierToken.sol";
import { EnergyOracleProviderToken } from "../../contracts/tokens/ERC712/EnergyOracleProviderToken.sol";
import { ElectricityConsumerToken } from "../../contracts/tokens/ERC1155/ElectricityConsumerToken.sol";

abstract contract DesDeployer {
    struct System {
        Main main;
        Register register;
        EnergyOracle oracle;
        Escrow escrow;
        StakingReward staking;
        EnergyCreditToken nrgct;
        MicrogridGovernanceToken mgt;
        EnergyProducerToken nrgpt;
        EnergySupplierToken nrgst;
        EnergyOracleProviderToken nrgopt;
        ElectricityConsumerToken elct;
    }

    function _deployDes(address usdc, address feeReceiver, uint256 feeAmount) internal returns (System memory s) {
        s.nrgct = new EnergyCreditToken();
        s.mgt = new MicrogridGovernanceToken();
        s.nrgpt = new EnergyProducerToken();
        s.nrgst = new EnergySupplierToken();
        s.nrgopt = new EnergyOracleProviderToken();
        s.elct = new ElectricityConsumerToken();

        Main.Tokens memory tokens = Main.Tokens({
            energyCreditToken: ERC20TokenBase(address(s.nrgct)),
            microgridGovernanceToken: ERC20TokenBase(address(s.mgt)),
            energyOracleProviderToken: ERC721TokenBase(address(s.nrgopt)),
            energyProducerToken: ERC721TokenBase(address(s.nrgpt)),
            energySupplierToken: ERC721TokenBase(address(s.nrgst)),
            electricityConsumerToken: s.elct
        });
        s.main = new Main(tokens, Main.Fees({ receiver: feeReceiver, amount: feeAmount }), usdc, usdc, usdc);

        s.register = new Register(address(s.main));
        s.escrow = new Escrow(address(s.main));
        s.oracle = new EnergyOracle(address(s.main));
        s.staking = new StakingReward(address(s.main));

        s.main.changeContracts(
            Main.Contracts({ staking: s.staking, oracle: s.oracle, register: s.register, escrow: s.escrow })
        );

        uint256 minter = s.mgt.MINTER_ROLE();
        uint256 burner = s.mgt.BURNER_ROLE();

        s.nrgpt.setRole(address(s.register), minter, true);
        s.nrgpt.setRole(address(s.register), burner, true);
        s.nrgst.setRole(address(s.register), minter, true);
        s.nrgst.setRole(address(s.register), burner, true);
        s.nrgopt.setRole(address(s.register), minter, true);
        s.nrgopt.setRole(address(s.register), burner, true);
        s.elct.setRole(address(s.register), minter, true);
        s.elct.setRole(address(s.register), burner, true);

        s.nrgct.setRole(address(s.oracle), minter, true);
        s.nrgct.setRole(address(s.oracle), burner, true);
        s.mgt.setRole(address(s.oracle), minter, true);

        s.mgt.setRole(address(s.staking), minter, true);

        s.oracle.setRole(address(s.escrow), s.oracle.ESCROW(), true);
    }
}
