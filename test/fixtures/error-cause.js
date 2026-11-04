throw new Error("outer failure", { cause: new Error("inner failure") });
